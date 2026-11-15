import express from "express";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const APK_DIR = path.join(DATA_DIR, "apks");
const DB_FILE = path.join(DATA_DIR, "apps.json");
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

fs.mkdirSync(APK_DIR, { recursive: true });
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, "[]");

app.use(express.json());
app.use("/apks", express.static(APK_DIR));

function readApps() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, "utf8")); }
  catch { return []; }
}
function writeApps(apps) {
  fs.writeFileSync(DB_FILE, JSON.stringify(apps, null, 2));
}
function requireAdmin(req, res, next) {
  const token = req.get("x-admin-token") || req.body?.token;
  if (!ADMIN_TOKEN || token !== ADMIN_TOKEN) {
    return res.status(401).json({ error: "Token admin salah atau belum disetel." });
  }
  next();
}
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, APK_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${crypto.randomUUID()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 1024 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (path.extname(file.originalname).toLowerCase() !== ".apk") {
      return cb(new Error("Hanya file .apk yang diperbolehkan."));
    }
    cb(null, true);
  }
});

app.get("/", (_req, res) => res.redirect("/admin"));
app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.get("/api/apps", (req, res) => {
  const base = `${req.protocol}://${req.get("host")}`;
  const apps = readApps().map(a => ({ ...a, downloadUrl: `${base}/apks/${encodeURIComponent(a.file)}` }));
  res.json(apps);
});

app.get("/admin", (_req, res) => res.type("html").send(`<!doctype html>
<html lang="id"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>STB APK Installer Admin</title>
<style>
body{font:16px Arial;background:#101522;color:#fff;max-width:760px;margin:35px auto;padding:0 18px}
input,textarea,button{box-sizing:border-box;width:100%;padding:13px;margin:7px 0;border-radius:8px;border:1px solid #39445c;background:#1b2638;color:white}
button{background:#2878e7;border:0;font-weight:bold;cursor:pointer} .item{background:#1b2638;padding:14px;margin:10px 0;border-radius:10px}
small{color:#b7c3d8} h1{color:#72aaff}
</style>
<h1>STB APK Installer</h1><p>Panel upload APK untuk katalog aplikasi STB.</p>
<label>Token Admin</label><input id="token" type="password" placeholder="Masukkan ADMIN_TOKEN">
<form id="f">
<input name="name" placeholder="Nama aplikasi" required>
<input name="version" placeholder="Versi, contoh 1.0.2" required>
<textarea name="description" placeholder="Deskripsi aplikasi"></textarea>
<input name="apk" type="file" accept=".apk,application/vnd.android.package-archive" required>
<button>Upload APK</button>
</form><p id="msg"></p><h2>Daftar aplikasi</h2><div id="apps"></div>
<script>
const $=id=>document.getElementById(id);
async function load(){
 const r=await fetch('/api/apps'); const a=await r.json();
 $('apps').innerHTML=a.map(x=>'<div class="item"><b>'+esc(x.name)+'</b> — '+esc(x.version)+'<br><small>'+esc(x.description||'')+'</small><br><button onclick="del(\\''+x.id+'\\')">Hapus</button></div>').join('')||'Belum ada APK.';
}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
$('f').onsubmit=async e=>{
 e.preventDefault(); const d=new FormData(e.target);
 const r=await fetch('/api/apps',{method:'POST',headers:{'x-admin-token':$('token').value},body:d});
 const j=await r.json(); $('msg').textContent=r.ok?'Upload berhasil.':(j.error||'Gagal upload.');
 if(r.ok){e.target.reset();load();}
};
async function del(id){
 if(!confirm('Hapus aplikasi ini?'))return;
 const r=await fetch('/api/apps/'+id,{method:'DELETE',headers:{'x-admin-token':$('token').value}});
 const j=await r.json(); $('msg').textContent=r.ok?'Aplikasi dihapus.':(j.error||'Gagal menghapus.');load();
}
load();
</script></html>`));

app.post("/api/apps", requireAdmin, upload.single("apk"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "File APK wajib dipilih." });
  const { name, version, description = "" } = req.body;
  if (!name?.trim() || !version?.trim()) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: "Nama dan versi wajib diisi." });
  }
  const apps = readApps();
  const item = {
    id: crypto.randomUUID(), name: name.trim(), version: version.trim(),
    description: description.trim(), file: req.file.filename,
    originalName: req.file.originalname, uploadedAt: new Date().toISOString()
  };
  apps.unshift(item);
  writeApps(apps);
  res.status(201).json(item);
});

app.delete("/api/apps/:id", requireAdmin, (req, res) => {
  const apps = readApps();
  const item = apps.find(a => a.id === req.params.id);
  if (!item) return res.status(404).json({ error: "Aplikasi tidak ditemukan." });
  const target = path.join(APK_DIR, path.basename(item.file));
  if (fs.existsSync(target)) fs.unlinkSync(target);
  writeApps(apps.filter(a => a.id !== item.id));
  res.json({ ok: true });
});

app.use((err, _req, res, _next) => {
  res.status(400).json({ error: err.message || "Permintaan tidak valid." });
});
app.listen(PORT, () => console.log(`STB APK Installer server listening on ${PORT}`));
