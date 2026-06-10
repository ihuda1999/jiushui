import type { VercelRequest, VercelResponse } from '@vercel/node';
import multer from 'multer';
import crypto from 'crypto';
import axios from 'axios';
import * as FormDataModule from 'form-data';
const FormData = FormDataModule.default || FormDataModule;
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
dayjs.extend(utc);
dayjs.extend(timezone);

// Configure multer for serverless (use memory storage)
const upload = multer({ storage: multer.memoryStorage() });

// Helper to run multer as a promise
function runMiddleware(req: VercelRequest, res: VercelResponse, fn: any) {
  return new Promise((resolve, reject) => {
    fn(req, res, (result: any) => {
      if (result instanceof Error) return reject(result);
      return resolve(result);
    });
  });
}

async function getFeishuTenantAccessToken() {
  const FEISHU_APP_ID = process.env.FEISHU_APP_ID;
  const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET;
  if (!FEISHU_APP_ID || !FEISHU_APP_SECRET) return null;

  const response = await fetch("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ app_id: FEISHU_APP_ID, app_secret: FEISHU_APP_SECRET }),
  });
  if (!response.ok) return null;
  const data = await response.json();
  return data.tenant_access_token;
}

async function uploadFileToFeishu(token: string, file: { buffer: Buffer; originalname: string; size: number }) {
  const form = new FormData();
  form.append('file_name', file.originalname);
  form.append('parent_type', 'bitable_file');
  form.append('parent_node', process.env.FEISHU_APP_TOKEN || '');
  form.append('size', file.size.toString());
  form.append('file', file.buffer, { filename: file.originalname });

  const res = await axios.post('https://open.feishu.cn/open-apis/drive/v1/medias/upload_all', form, {
    headers: { 'Authorization': `Bearer ${token}`, ...form.getHeaders() },
  });

  if (res.data.code !== 0) {
    throw new Error(`Feishu upload failed: ${res.data.msg} (Code: ${res.data.code})`);
  }
  return res.data.data.file_token;
}

async function syncToFeishu(tableNumber: string, liquorName: string, barcodeFiles: any[], productionFiles: any[]) {
  const FEISHU_APP_TOKEN = process.env.FEISHU_APP_TOKEN;
  const FEISHU_TABLE_ID = process.env.FEISHU_TABLE_ID;
  if (!FEISHU_APP_TOKEN || !FEISHU_TABLE_ID) return;

  const token = await getFeishuTenantAccessToken();
  if (!token) throw new Error("Unable to get Feishu Tenant Access Token");

  const BARCODE_FIELD_ID = "fld9pPem9N";
  const PRODUCTION_FIELD_ID = "flddQNUkx1";

  const barcodeTokens = await Promise.all(barcodeFiles.map((f: any) => uploadFileToFeishu(token, f)));
  const productionTokens = await Promise.all(productionFiles.map((f: any) => uploadFileToFeishu(token, f)));

  const barcodeAttachments = barcodeTokens.map((ft: string) => ({ file_token: ft }));
  const productionAttachments = productionTokens.map((ft: string) => ({ file_token: ft }));
  const submitTimeStr = dayjs().tz('Asia/Shanghai').format("YYYY-MM-DD HH:mm:ss");

  const fields = {
    "日期": submitTimeStr,
    "桌台": tableNumber,
    "酒水名称": liquorName,
    "酒水条形码": barcodeAttachments,
    "酒水生产日期": productionAttachments,
  };

  const response = await fetch(`https://open.feishu.cn/open-apis/bitable/v1/apps/${FEISHU_APP_TOKEN}/tables/${FEISHU_TABLE_ID}/records`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
    body: JSON.stringify({ fields }),
  });

  const respData = await response.json();
  if (respData.code !== 0) {
    throw new Error(`Failed to add record to Feishu bitable: ${respData.msg} (Code: ${respData.code})`);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers for cross-origin requests (e.g. GitHub Pages → Vercel API)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await runMiddleware(req, res, upload.any());

    const { tableNumber, liquorName } = req.body;
    const files: any[] = req.files as any[] || [];

    const barcodeFiles = files.filter(f => f.fieldname === "barcodeFile");
    const productionFiles = files.filter(f => f.fieldname === "productionDateFile");

    await syncToFeishu(tableNumber, liquorName, barcodeFiles, productionFiles);

    return res.json({ success: true, message: "Submission accepted" });
  } catch (err: any) {
    console.error("Submit error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
}

export const config = {
  api: {
    bodyParser: false,
  },
};
