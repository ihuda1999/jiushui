import 'dotenv/config';
import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import axios from "axios";
import * as FormDataModule from "form-data";
const FormData = FormDataModule.default || FormDataModule;
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
dayjs.extend(utc);
dayjs.extend(timezone);
import { createServer as createViteServer } from "vite";

const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/')
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const uniqueSuffix = crypto.randomUUID();
    // Feishu might need english filenames to avoid some encode bugs, let's keep it safe
    cb(null, file.fieldname + '-' + uniqueSuffix + ext)
  }
});

const upload = multer({ storage: storage });

async function getFeishuTenantAccessToken() {
  const FEISHU_APP_ID = process.env.FEISHU_APP_ID;
  const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET;
  
  if (!FEISHU_APP_ID || !FEISHU_APP_SECRET) {
    return null;
  }
  const response = await fetch("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      app_id: FEISHU_APP_ID,
      app_secret: FEISHU_APP_SECRET,
    }),
  });
  if (!response.ok) {
    return null;
  }
  const data = await response.json();
  return data.tenant_access_token;
}

async function uploadFileToFeishu(token: string, fieldId: string, file: Express.Multer.File) {
  const form = new FormData();
  form.append('file_name', file.originalname);
  form.append('parent_type', 'bitable_file'); 
  form.append('parent_node', process.env.FEISHU_APP_TOKEN || ''); 
  form.append('size', file.size.toString());
  form.append('file', fs.createReadStream(file.path));

  try {
    const res = await axios.post('https://open.feishu.cn/open-apis/drive/v1/medias/upload_all', form, {
      headers: {
        'Authorization': `Bearer ${token}`,
        ...form.getHeaders()
      }
    });

    if (res.data.code !== 0) {
      console.error("Feishu upload failed:", res.data);
      throw new Error(`Feishu upload failed: ${res.data.msg} (Code: ${res.data.code}, Body: ${JSON.stringify(res.data)})`);
    }
    return res.data.data.file_token;
  } catch (err: any) {
    if (err.response) {
      throw new Error(`Feishu API Error: ${err.response.status}, ${JSON.stringify(err.response.data)}`);
    } else {
      throw new Error(`Axios error: ${err.message}`);
    }
  }
}

async function syncToFeishu(tableNumber: string, liquorName: string, barcodeFiles: Express.Multer.File[], productionFiles: Express.Multer.File[]) {
  const FEISHU_APP_TOKEN = process.env.FEISHU_APP_TOKEN;
  const FEISHU_TABLE_ID = process.env.FEISHU_TABLE_ID;
  
  if (!FEISHU_APP_TOKEN || !FEISHU_TABLE_ID) {
    console.log("Feishu config missing, skipping sync.");
    return;
  }
  const token = await getFeishuTenantAccessToken();
  if (!token) {
    throw new Error("Unable to get Feishu Tenant Access Token");
  }

  const BARCODE_FIELD_ID = "fld9pPem9N";
  const PRODUCTION_FIELD_ID = "flddQNUkx1";

  // Upload files to Feishu and get file_tokens
  const barcodeTokens = await Promise.all(barcodeFiles.map(f => uploadFileToFeishu(token, BARCODE_FIELD_ID, f)));
  const productionTokens = await Promise.all(productionFiles.map(f => uploadFileToFeishu(token, PRODUCTION_FIELD_ID, f)));

  // Format attachment objects properly
  const barcodeAttachments = barcodeTokens.map(ft => ({ file_token: ft }));
  const productionAttachments = productionTokens.map(ft => ({ file_token: ft }));

  // the field is just string dates, or real dates? "日期" string is safer if it is "Text". Based on schema, type: 1 (Text).
  const submitTimeStr = dayjs().tz('Asia/Shanghai').format("YYYY-MM-DD HH:mm:ss");

  const fields = {
    // According to table schema: "日期" (Text), "桌台" (Text), "酒水名称" (Text), "酒水条形码" (Attachment), "酒水生产日期" (Attachment)
    "日期": submitTimeStr,
    "桌台": tableNumber,
    "酒水名称": liquorName,
    "酒水条形码": barcodeAttachments,
    "酒水生产日期": productionAttachments,
  };

  const response = await fetch(`https://open.feishu.cn/open-apis/bitable/v1/apps/${FEISHU_APP_TOKEN}/tables/${FEISHU_TABLE_ID}/records`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({ fields }),
  });

  const respData = await response.json();
  if (respData.code !== 0) {
    console.error("Feishu bitable API error full:", JSON.stringify(respData, null, 2));
    throw new Error(`Failed to add record to Feishu bitable: ${respData.msg} (Code: ${respData.code})`);
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());
  
  app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

  app.post("/api/verify/submit", upload.any(), async (req, res) => {
    try {
      const { tableNumber, liquorName } = req.body;
      const files = (req.files || []) as Express.Multer.File[];
      
      const barcodeFiles = files.filter(f => f.fieldname === "barcodeFile");
      const productionFiles = files.filter(f => f.fieldname === "productionDateFile");

      console.log(`Syncing submission for Table: ${tableNumber}, Liquor: ${liquorName}`);
      // Trigger background processing without awaiting to respond quickly
      syncToFeishu(tableNumber, liquorName, barcodeFiles, productionFiles)
        .catch(err => console.error("Background sync failed:", err));
      
      res.json({ success: true, message: "Submission accepted" });
    } catch (err: any) {
      console.error("Submit error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
