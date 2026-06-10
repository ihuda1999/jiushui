import React, { useState, useRef, useCallback, useMemo } from "react";
import { Camera, X, ZoomIn, CheckCircle, AlertCircle, Loader2, Plus } from "lucide-react";
import { liquorOptions } from "./liquorList";

async function compressImage(file: File): Promise<File> {
  if (file.type.startsWith("video/") || file.size < 300 * 1024) return file;
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 1600;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        if (width > height) {
          height = Math.round((height * MAX) / width);
          width = MAX;
        } else {
          width = Math.round((width * MAX) / height);
          height = MAX;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d")?.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob || blob.size >= file.size) {
            resolve(file);
            return;
          }
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" }));
        },
        "image/jpeg",
        0.78
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };
    img.src = url;
  });
}

const THUMB_W = 90;

function ExampleThumbnail({ src, description }: { src: string; description: string }) {
  const [enlarged, setEnlarged] = useState(false);
  return (
    <>
      <button
        onClick={() => setEnlarged(true)}
        className="relative shrink-0 overflow-hidden rounded-xl cursor-pointer group bg-gray-100"
        style={{ width: THUMB_W, aspectRatio: "3/4" }}
        type="button"
      >
        <img src={src} alt="示例" className="w-full h-full object-cover" loading="eager" fetchPriority="high" />
        <div className="absolute inset-0 bg-black/30 group-active:bg-black/40 transition-colors"></div>
        <div className="absolute bottom-0 inset-x-0 bg-black/50 py-1 flex items-center justify-center gap-0.5">
          <ZoomIn size={10} className="text-white" />
          <span className="text-[11px] text-white">查看示例</span>
        </div>
      </button>
      {enlarged && (
        <div
          className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-5"
          onClick={() => setEnlarged(false)}
        >
          <div className="relative max-w-xs w-full" onClick={(e) => e.stopPropagation()}>
            <button
              className="absolute -top-9 right-0 flex items-center gap-1 text-white/80 text-sm"
              onClick={() => setEnlarged(false)}
            >
              <X size={18} /> 关闭
            </button>
            <img src={src} alt="示例大图" className="w-full rounded-2xl object-contain" />
            <p className="text-center text-white/70 text-xs mt-3 leading-relaxed px-2">
              {description}
            </p>
          </div>
        </div>
      )}
    </>
  );
}

function FileThumbnail({
  item,
  onRemove,
}: {
  item: { id: string; file: File; preview: string };
  onRemove: () => void;
  key?: string;
}) {
  const [previewing, setPreviewing] = useState(false);
  const isVideo = item.file.type.startsWith("video/");
  return (
    <>
      <div
        className="relative shrink-0 overflow-hidden rounded-xl border border-gray-100 cursor-pointer"
        style={{ width: THUMB_W, aspectRatio: "3/4" }}
        onClick={() => setPreviewing(true)}
      >
        {isVideo ? (
          <video src={item.preview} className="w-full h-full object-cover pointer-events-none" />
        ) : (
          <img src={item.preview} alt="uploaded" className="w-full h-full object-cover" />
        )}
        <div className="absolute inset-0 bg-black/10 active:bg-black/20 transition-colors"></div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="absolute top-1 right-1 bg-black/55 rounded-full p-0.5 backdrop-blur-sm"
        >
          <X size={11} className="text-white" />
        </button>
        {isVideo && (
          <div className="absolute bottom-1 left-1 bg-black/50 rounded px-1 py-0.5">
            <span className="text-[9px] text-white">视频</span>
          </div>
        )}
      </div>
      {previewing && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-5"
          onClick={() => setPreviewing(false)}
        >
          <div className="relative max-w-xs w-full" onClick={(e) => e.stopPropagation()}>
            <button
              className="absolute -top-9 right-0 flex items-center gap-1 text-white/70 text-sm"
              onClick={() => setPreviewing(false)}
            >
              <X size={18} /> 关闭
            </button>
            {isVideo ? (
              <video
                src={item.preview}
                controls
                autoPlay
                className="w-full rounded-2xl max-h-[70vh] object-contain"
              />
            ) : (
              <img
                src={item.preview}
                alt="预览"
                className="w-full rounded-2xl object-contain max-h-[70vh]"
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}

function FileUploadZone({
  label,
  exampleSrc,
  exampleDesc,
  values,
  onChange,
  error,
}: {
  label: string;
  exampleSrc: string;
  exampleDesc: string;
  values: { id: string; file: File; preview: string }[];
  onChange: (vals: { id: string; file: File; preview: string }[]) => void;
  error: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const picked = Array.from(e.target.files ?? []) as File[];
      if (!picked.length) return;
      const newItems = picked.map((f) => ({
        id: `${f.name}-${Date.now()}-${Math.random()}`,
        file: f,
        preview: URL.createObjectURL(f),
      }));
      onChange([...values, ...newItems]);
      e.target.value = "";
    },
    [values, onChange]
  );
  const remove = (id: string) => onChange(values.filter((v) => v.id !== id));
  return (
    <div className="space-y-2">
      <p className="text-[13px] font-semibold text-gray-700 flex items-center gap-1">
        <span className="text-red-500">*</span>
        {label}
      </p>
      <div className="flex gap-2 flex-wrap items-start">
        <ExampleThumbnail src={exampleSrc} description={exampleDesc} />
        {values.map((item) => (
          <FileThumbnail key={item.id} item={item} onRemove={() => remove(item.id)} />
        ))}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className={`shrink-0 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-colors active:scale-[0.98]
            ${
              error && values.length === 0
                ? "border-red-300 bg-red-50"
                : "border-dashed border-gray-300 bg-gray-50 active:bg-gray-100"
            }`}
          style={{ width: THUMB_W, aspectRatio: "3/4" }}
        >
          {values.length === 0 ? (
            <>
              <Camera size={20} className={error ? "text-red-400" : "text-gray-400"} />
              <span className="text-[11px] text-gray-400 leading-none">照片/视频</span>
            </>
          ) : (
            <>
              <Plus size={18} className="text-gray-400" />
              <span className="text-[11px] text-gray-400 leading-none">继续添加</span>
            </>
          )}
        </button>
      </div>
      {error && values.length === 0 && (
        <p className="text-[11px] text-red-400 flex items-center gap-1">
          <AlertCircle size={11} /> 请上传此项照片或视频
        </p>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={handleChange}
      />
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  error,
  errorMsg,
  suggestions = [],
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
  placeholder: string;
  error: boolean;
  errorMsg: string;
  suggestions?: string[];
}) {
  const [showSuggestions, setShowSuggestions] = useState(false);

  return (
    <div className="space-y-1.5 relative">
      <label className="text-[13px] font-semibold text-gray-700 flex items-center gap-1">
        <span className="text-red-500">*</span>
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setShowSuggestions(e.target.value.length > 0);
        }}
        onFocus={() => setShowSuggestions(value.length > 0)}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
        placeholder={placeholder}
        className={`w-full px-3.5 py-2.5 rounded-xl border text-[13px] outline-none transition-all
          placeholder:text-gray-300
          ${
            error
              ? "border-red-300 bg-red-50 text-red-700"
              : "border-gray-200 bg-gray-50 focus:border-gray-400 focus:bg-white text-gray-800"
          }`}
      />
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-40 overflow-y-auto">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              className="w-full text-left px-4 py-2.5 text-[13px] hover:bg-gray-50 text-gray-700"
              onClick={() => {
                onChange(suggestion);
                setShowSuggestions(false);
              }}
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
      {error && errorMsg && (
        <p className="text-[11px] text-red-400 flex items-center gap-1">
          <AlertCircle size={11} /> {errorMsg}
        </p>
      )}
    </div>
  );
}

export default function App() {
  const [tableNumber, setTableNumber] = useState("");
  const [liquorName, setLiquorName] = useState("");
  const [barcodeFiles, setBarcodeFiles] = useState<{ id: string; file: File; preview: string }[]>([]);
  const [productionFiles, setProductionFiles] = useState<{ id: string; file: File; preview: string }[]>([]);
  const [submitState, setSubmitState] = useState<"idle" | "submitting" | "error" | "success">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [touched, setTouched] = useState(false);

  const isValid = tableNumber.trim() && liquorName.trim() && barcodeFiles.length > 0 && productionFiles.length > 0;

  const filteredSuggestions = useMemo(() => {
    return liquorOptions.filter((o) => o.includes(liquorName));
  }, [liquorName]);

  const handleSubmit = useCallback(async () => {
    setTouched(true);
    if (!isValid) return;

    setSubmitState("submitting");
    const snapTable = tableNumber.trim();
    const snapLiquor = liquorName.trim();
    const snapBarcode = [...barcodeFiles];
    const snapProduction = [...productionFiles];

    try {
      const [compressedBarcodes, compressedProductions] = await Promise.all([
        Promise.all(snapBarcode.map((f) => compressImage(f.file))),
        Promise.all(snapProduction.map((f) => compressImage(f.file))),
      ]);

      const formData = new FormData();
      formData.append("tableNumber", snapTable);
      formData.append("liquorName", snapLiquor);
      compressedBarcodes.forEach((f) => formData.append("barcodeFile", f, f.name));
      compressedProductions.forEach((f) => formData.append("productionDateFile", f, f.name));

      const apiBase = import.meta.env.VITE_API_BASE || "";
      const response = await fetch(`${apiBase}/api/verify/submit`, { method: "POST", body: formData });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `提交失败 (${response.status})`);
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || "提交失败，请重试");
      }

      setSubmitState("success");
    } catch (err: any) {
      console.error("Submission error:", err);
      setSubmitState("error");
      setErrorMsg(err.message || "网络错误，请检查连接后重试");
    }
  }, [isValid, tableNumber, liquorName, barcodeFiles, productionFiles]);

  const handleReset = () => {
    setTableNumber("");
    setLiquorName("");
    setBarcodeFiles([]);
    setProductionFiles([]);
    setSubmitState("idle");
    setErrorMsg("");
    setTouched(false);
  };

  if (submitState === "submitting") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-5">
        <div className="bg-white rounded-2xl p-8 w-full max-w-sm flex flex-col items-center gap-5 text-center shadow-sm">
          <div className="w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center">
            <Loader2 size={28} className="text-blue-500 animate-spin" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-lg font-bold text-gray-900">正在提交</h2>
            <p className="text-[13px] text-gray-400 leading-relaxed">
              照片上传中，请稍候…
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (submitState === "success") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-5">
        <div className="bg-white rounded-2xl p-8 w-full max-w-sm flex flex-col items-center gap-5 text-center shadow-sm">
          <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center">
            <CheckCircle size={28} className="text-green-500" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-lg font-bold text-gray-900">提交成功</h2>
            <p className="text-[13px] text-gray-400 leading-relaxed">
              信息已同步至管理系统，记录完整留存
            </p>
          </div>
          <button
            onClick={handleReset}
            className="w-full py-3 rounded-xl bg-red-500 text-white font-semibold text-sm active:bg-red-600 transition-colors"
          >
            继续录入下一条
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-md mx-auto pb-4">
        <div className="bg-white px-5 pt-12 pb-4">
          <div className="flex items-center gap-2">
            <div className="w-0.5 h-4 bg-red-500 rounded-full"></div>
            <h1 className="text-[17px] font-bold text-gray-900">胡大三店酒水信息录入</h1>
          </div>
          <p className="text-[11px] text-gray-400 mt-1 pl-3">上酒前留存凭证，防止顾客调包索赔</p>
        </div>

        <div className="px-4 mt-3 space-y-3">
          <div className="bg-white rounded-2xl p-4 space-y-4">
            <p className="text-[11px] font-medium text-gray-400 tracking-wide pb-1 border-b border-gray-50">
              基础信息
            </p>
            <Field
              label="服务桌台"
              value={tableNumber}
              onChange={setTableNumber}
              placeholder="如：A03"
              error={touched && !tableNumber.trim()}
              errorMsg="请输入桌台号"
            />
            <Field
              label="酒水名称"
              value={liquorName}
              onChange={setLiquorName}
              placeholder="如：飞天茅台53度"
              error={touched && !liquorName.trim()}
              errorMsg="请输入酒水名称"
              suggestions={filteredSuggestions}
            />
          </div>

          <div className="bg-white rounded-2xl p-4 space-y-5">
            <p className="text-[11px] font-medium text-gray-400 tracking-wide pb-1 border-b border-gray-50">
              上传照片 / 视频
            </p>
            <FileUploadZone
              label="含酒水条形码全貌照片"
              exampleSrc="/example-barcode.png"
              exampleDesc="展示完整的酒盒背面，需拍清下方的条形码及防伪标"
              values={barcodeFiles}
              onChange={setBarcodeFiles}
              error={touched && barcodeFiles.length === 0}
            />
            <div className="border-t border-gray-50"></div>
            <FileUploadZone
              label="生产日期细节照片/视频"
              exampleSrc="/example-production.png"
              exampleDesc="展示酒盒顶部的生产日期及批次喷码，并包含防伪溯源二维码"
              values={productionFiles}
              onChange={setProductionFiles}
              error={touched && productionFiles.length === 0}
            />
          </div>

          {submitState === "error" && errorMsg && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5">
              <AlertCircle size={14} className="text-red-400 shrink-0" />
              <p className="text-[12px] text-red-500">{errorMsg}</p>
            </div>
          )}
        </div>
      </div>

      <div className="px-4 pb-8 pt-2">
        <div className="max-w-md mx-auto space-y-1.5">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitState === "submitting"}
            className="w-full py-3.5 rounded-2xl bg-red-500 text-white font-semibold text-sm active:bg-red-600 active:scale-[0.99] shadow-sm shadow-red-100 transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:active:scale-100"
          >
            {submitState === "submitting" ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                提交中…
              </>
            ) : (
              "确认并提交"
            )}
          </button>
          {touched && !isValid && (
            <p className="text-center text-[11px] text-gray-400">请完善所有必填项后再提交</p>
          )}
        </div>
      </div>
    </div>
  );
}
