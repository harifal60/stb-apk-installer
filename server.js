import express from "express";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const app = express();
const PORT = process.env.PORT || 8080;
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const APK_DIR = path.join(DATA_DIR, "apks");
const DB_FILE = path.join(DATA_DIR, "apps.json");
const ADMIN_TOKEN = (process.env.ADMIN_TOKEN || "").trim();

fs.mkdirSync(APK_DIR, { recursive: true });
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, "[]");

app.use(express.json());
app.use("/apks", express.static(APK_DIR));

function readApps() {
  try {
    const data = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeApps(apps) {
  fs.writeFileSync(DB_FILE, JSON.stringify(apps, null, 2));
}

function requireAdmin(req, res, next) {
  const token = (req.get("x-admin-token") || "").trim();
  if (!ADMIN_TOKEN || token !== ADMIN_TOKEN) {
    return res.status(401).json({ error: "Token admin salah atau ADMIN_TOKEN di Railway belum cocok." });
  }
  next();
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, APK_DIR),
  filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`)
});

const upload = multer({
  storage,
  limits: { fileSize: 1024 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (path.extname(file.originalname).toLowerCase() !== ".apk") {
      return cb(new Error("Hanya file dengan ekstensi .apk yang diperbolehkan."));
    }
    cb(null, true);
  }
});

app.get("/", (_req, res) => res.redirect("/catalog"));
app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.get("/api/apps", (req, res) => {
  const base = `${req.protocol}://${req.get("host")}`;
  const apps = readApps().map(a => ({
    ...a,
    downloadUrl: `${base}/apks/${encodeURIComponent(a.file)}`
  }));
  res.json(apps);
});

app.get("/catalog", (_req, res) => res.send(`<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>STB APK STORE</title>
<style>
*{box-sizing:border-box}
body{
 margin:0;
 font-family:Arial,sans-serif;
 background:linear-gradient(145deg,#080d1b,#111d35,#17112d);
 color:#fff;
 min-height:100vh;
}
header{
 padding:30px 20px;
 background:linear-gradient(120deg,#174cba,#6429a9);
 border-radius:0 0 28px 28px;
 box-shadow:0 8px 30px #0006;
}
.logo{font-size:34px;font-weight:900;letter-spacing:1px}
.logo span{color:#8edbff}
.subtitle{color:#dbeafe;margin-top:10px}
.container{max-width:850px;margin:auto;padding:20px}
.search{
 width:100%;padding:17px 20px;
 border:1px solid #405274;
 border-radius:15px;
 background:#1b2942;color:white;
 font-size:16px;outline:none;
 margin:12px 0 20px;
}
.search:focus{border-color:#65a8ff}
.heading{font-size:21px;font-weight:bold;margin:20px 0}
.count{color:#9bb4d8;font-size:13px}
.item{
 background:linear-gradient(145deg,#1c2c49,#172238);
 border:1px solid #344969;
 border-radius:20px;
 padding:20px;
 margin:15px 0;
 box-shadow:0 8px 20px #0003;
 transition:.2s;
}
.item h3{font-size:21px;margin:0 0 12px}
.version{
 display:inline-block;
 background:#164e9c;
 color:#b9dcff;
 padding:5px 11px;
 border-radius:20px;
 font-size:12px;
 margin-bottom:12px;
}
.desc{color:#c4d1e5;line-height:1.6}
.download{
 display:block;
 text-align:center;
 text-decoration:none;
 background:linear-gradient(100deg,#2878f5,#6550e8);
 color:white;padding:15px;
 border-radius:12px;
 font-weight:bold;
 margin-top:18px;
}
.download:active{transform:scale(.98)}
.empty{
 text-align:center;padding:35px 15px;
 background:#1b2942;border-radius:18px;
 color:#a9bddb;
}
footer{
 text-align:center;padding:30px 15px;
 color:#8194b4;font-size:13px;
}
</style>
</head>

<body>

<header>
  <div class="logo">📺 STB <span>APK STORE</span></div>
  <div class="subtitle">
    Pusat aplikasi Android TV & Smart STB
  </div>
  <p style="margin-top:20px;font-size:14px;color:#dbeafe">
    Temukan dan download aplikasi favoritmu dengan mudah.
  </p>
</header>

<main class="container">

  <div style="margin:15px 0 25px;padding:18px;background:#1b2942;border-radius:16px">
    <h3 style="margin:0 0 8px">👋 Selamat Datang!</h3>
    <p style="margin:0;color:#a9bddb;font-size:14px">
      Koleksi aplikasi pilihan untuk Android TV dan Smart STB.
    </p>
  </div>

  <input
    class="search"
    id="search"
    placeholder="🔍 Cari aplikasi favorit kamu..."
  >

  <div class="heading">
    Aplikasi tersedia
    <div class="count" id="count">Memuat katalog...</div>
  </div>

  <div id="apps">
    <div class="empty">Memuat aplikasi...</div>
  </div>

</main>

<footer>
  <b>📺 STB APK STORE</b><br>
  Pusat download aplikasi Android TV.<br>
  <small>© 2026 STB APK STORE</small>
</footer>
</body>


<script>
let allApps=[];

function showApps(list){
 const box=document.getElementById('apps');
 const count=document.getElementById('count');
 box.innerHTML='';
 count.textContent=list.length+' aplikasi ditemukan';

 if(!list.length){
  box.innerHTML='<div class="empty">Aplikasi tidak ditemukan.</div>';
  return;
 }

 list.forEach(a=>{
  const item=document.createElement('div');
  item.className='item';

  const title=document.createElement('h3');
  title.textContent='📦 '+a.name;

  const version=document.createElement('div');
  version.className='version';
  version.textContent='VERSI '+a.version;

  const desc=document.createElement('p');
  desc.className='desc';
  desc.textContent=a.description||'Aplikasi Android TV dan STB.';

  const link=document.createElement('a');
  link.className='download';
  link.href=a.downloadUrl;
  link.textContent='⬇ DOWNLOAD APK';
  link.setAttribute('download','');

  item.append(title,version,desc,link);
  box.appendChild(item);
 });
}

fetch('/api/apps')
.then(r=>{
 if(!r.ok) throw new Error('Gagal mengambil katalog');
 return r.json();
})
.then(apps=>{
 allApps=apps;
 showApps(allApps);
})
.catch(()=>{
 document.getElementById('apps').innerHTML=
 '<div class="empty">Gagal memuat aplikasi. Silakan muat ulang halaman.</div>';
});

document.getElementById('search').addEventListener('input',function(){
 const q=this.value.toLowerCase();
 showApps(allApps.filter(a=>
  (a.name+' '+a.version+' '+(a.description||''))
  .toLowerCase().includes(q)
 ));
});
</script>
</body>
</html>`));

app.get("/admin", (_req, res) => res.type("html").send(`<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>STB APK Installer Admin</title>
<style>
*{box-sizing:border-box}
body{font:16px Arial,sans-serif;background:#101522;color:#fff;max-width:760px;margin:35px auto;padding:0 18px}
input,textarea,button{width:100%;padding:13px;margin:7px 0;border-radius:8px;border:1px solid #39445c;background:#1b2638;color:white;font:inherit}
input[type=file]{padding:16px}
button{background:#2878e7;border:0;font-weight:bold;cursor:pointer}
button:disabled{opacity:.65;cursor:wait}
.item{background:#1b2638;padding:14px;margin:10px 0;border-radius:10px}
small{color:#b7c3d8}h1{color:#72aaff}
#msg{white-space:pre-wrap;overflow-wrap:anywhere}.success{color:#75d69a}.error{color:#ff9292}
</style>
</head>
<body>
<h1>STB APK Installer</h1>
<p>Panel upload APK untuk katalog aplikasi STB.</p>
<label for="token">Token Admin</label>
<input id="token" type="password" autocomplete="off" placeholder="Masukkan ADMIN_TOKEN">
<form id="f">
<input name="name" placeholder="Nama aplikasi" required>
<input name="version" placeholder="Versi, contoh 1.0.2" required>
<textarea name="description" placeholder="Deskripsi aplikasi"></textarea>

<input name="icon" placeholder="Ikon aplikasi, contoh 📺 atau 🎬" maxlength="12">

<select name="category">
  <option value="IPTV">IPTV</option>
  <option value="TV & Hiburan">TV & Hiburan</option>
  <option value="Tools">Tools</option>
  <option value="Pemutar Video">Pemutar Video</option>
  <option value="Lainnya" selected>Lainnya</option>
</select>

<input name="apk" type="file" accept=".apk,application/vnd.android.package-archive" required>
<button id="uploadBtn" type="submit">Upload APK</button>
</form>
<p id="msg" role="status" aria-live="polite"></p>
<h2>Daftar aplikasi</h2>
<div id="apps">Memuat daftar aplikasi...</div>
<script>
const $ = id => document.getElementById(id);
function showMessage(message, kind) {
  $("msg").textContent = message;
  $("msg").className = kind || "";
}
function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  })[c]);
}
async function readJson(response) {
  const body = await response.text();
  try { return body ? JSON.parse(body) : {}; }
  catch { throw new Error("Server mengirim respons tidak valid (HTTP " + response.status + ")."); }
}
async function loadApps() {
  try {
    const response = await fetch("/api/apps", { cache: "no-store" });
    if (!response.ok) throw new Error("Gagal memuat daftar aplikasi (HTTP " + response.status + ").");
    const apps = await readJson(response);
    $("apps").innerHTML = apps.map(item =>
      '<div class="item"><b>' + esc(item.name) + '</b> — ' + esc(item.version) +
      '<br><small>' + esc(item.description || "") + '</small><br>' +
      '<a style="color:#8dbaff" href="' + esc(item.downloadUrl) + '">Download APK</a> ' +
      '<button type="button" class="deleteBtn" data-id="' + esc(item.id) + '">Hapus</button></div>'
    ).join("") || "Belum ada APK.";
  } catch (error) {
    $("apps").textContent = error.message || "Tidak bisa memuat daftar aplikasi.";
  }
}

$("f").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const file = form.elements.apk.files[0];
  if (!file) return showMessage("Pilih file APK terlebih dahulu.", "error");
  if (!file.name.toLowerCase().endsWith(".apk")) return showMessage("File harus berakhiran .apk.", "error");
  if (!$("token").value.trim()) return showMessage("Token admin wajib diisi.", "error");

  const button = $("uploadBtn");
  button.disabled = true;
  button.textContent = "Sedang mengupload...";
  showMessage("Mengirim file ke server. Tunggu sampai proses selesai.", "");
  try {
    const response = await fetch("/api/apps", {
      method: "POST",
      headers: { "x-admin-token": $("token").value.trim() },
      body: new FormData(form)
    });
    const result = await readJson(response);
    if (!response.ok) throw new Error(result.error || ("Upload gagal (HTTP " + response.status + ")."));
    showMessage("Upload berhasil: " + result.name + " versi " + result.version, "success");
    form.reset();
    await loadApps();
  } catch (error) {
    showMessage("Upload gagal: " + (error.message || "Koneksi ke server terputus."), "error");
  } finally {
    button.disabled = false;
    button.textContent = "Upload APK";
  }
});

$("apps").addEventListener("click", async event => {
  const button = event.target.closest(".deleteBtn");
  if (!button || !confirm("Hapus aplikasi ini?")) return;
  try {
    const response = await fetch("/api/apps/" + encodeURIComponent(button.dataset.id), {
      method: "DELETE",
      headers: { "x-admin-token": $("token").value.trim() }
    });
    const result = await readJson(response);
    if (!response.ok) throw new Error(result.error || "Gagal menghapus aplikasi.");
    showMessage("Aplikasi berhasil dihapus.", "success");
    await loadApps();
  } catch (error) {
    showMessage(error.message || "Gagal menghapus aplikasi.", "error");
  }
});
loadApps();
</script>
</body></html>`));

app.post("/api/apps", requireAdmin, upload.single("apk"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "File APK wajib dipilih." });
  const { name, version, description = "" } = req.body;
  if (!name?.trim() || !version?.trim()) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: "Nama dan versi wajib diisi." });
  }
  const apps = readApps();
  const item = {
    id: crypto.randomUUID(),
    name: name.trim(),
    version: version.trim(),
    description: description.trim(),
    file: req.file.filename,
    originalName: req.file.originalname,
    uploadedAt: new Date().toISOString()
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
  const message = err instanceof multer.MulterError
    ? (err.code === "LIMIT_FILE_SIZE" ? "Ukuran APK melebihi batas 1 GB." : "Upload file gagal: " + err.message)
    : (err.message || "Permintaan tidak valid.");
  res.status(err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE" ? 413 : 400)
    .json({ error: message });
});

app.listen(PORT, "0.0.0.0", () => console.log(`STB APK Installer server listening on ${PORT}`));
