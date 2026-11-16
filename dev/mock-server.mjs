// Mock server cho người code giao diện khi chưa có/không cài .NET.
// Cùng hợp đồng API với Program.cs nhưng lưu dữ liệu trong RAM.
// Chạy:  node dev/mock-server.mjs      → http://localhost:5000
// Biến môi trường: PORT (mặc định 5000), DELAY_MS (giả lập mạng chậm, mặc định 600)
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../wwwroot/', import.meta.url));
const PORT = Number(process.env.PORT || 5000);
const DELAY = Number(process.env.DELAY_MS ?? 600);

const events = [
  { id: 1, title: 'Tech Seminar: Building Modern Web with React & Next.js', category: 'Web Development', time: '2026-10-24T09:00:00', endTime: '2026-10-24T11:30:00', location: 'Hội trường A · Cơ sở chính', capacity: 50,
    description: 'Khám phá cách xây dựng ứng dụng web hiện đại với React và Next.js qua một demo thực tế, từ tổ chức giao diện đến tối ưu trải nghiệm người dùng.',
    highlights: ['Tổ chức giao diện thành các component tái sử dụng.', 'Làm quen với routing và rendering trong Next.js.', 'Theo dõi demo và trao đổi trực tiếp với diễn giả.'] },
  { id: 2, title: 'Workshop: Thiết kế giao diện web với Figma', category: 'UI/UX Design', time: '2026-10-24T13:30:00', endTime: '2026-10-24T15:30:00', location: 'Phòng B1.14 · Tòa B', capacity: 30,
    description: 'Thực hành dựng design system nhỏ trong Figma: Variables, component có variants, Auto Layout và bàn giao cho lập trình viên bằng Dev Mode.',
    highlights: ['Tạo Variables màu Light/Dark và đặt Code Syntax cho CSS.', 'Dựng component Button, Input với đầy đủ trạng thái.', 'Đọc thông số trong Dev Mode và chuyển thành HTML/CSS.'] },
  { id: 3, title: 'Showcase: Dự án web của sinh viên UIT', category: 'Showcase', time: '2026-10-24T16:00:00', endTime: '2026-10-24T17:00:00', location: 'Sảnh tòa E', capacity: 3,
    description: 'Các nhóm sinh viên trình bày dự án web nổi bật trong học kỳ, kèm phần hỏi đáp và bình chọn dự án được yêu thích nhất.',
    highlights: ['Xem demo trực tiếp các dự án web của sinh viên.', 'Trao đổi kinh nghiệm làm việc nhóm và triển khai.', 'Bình chọn dự án được yêu thích nhất.'] },
];
const registrations = [];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MSSV_RE = /^\d{8}$/;
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' };

const dto = (e) => {
  const registered = registrations.filter((r) => r.eventId === e.id).length;
  return { ...e, registered, remaining: Math.max(0, e.capacity - registered) };
};
const send = (res, status, body, type = 'application/json; charset=utf-8') => {
  res.writeHead(status, { 'Content-Type': type });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function readBody(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  try { return JSON.parse(raw); } catch { return null; }
}

async function register(req, res) {
  const body = await readBody(req);
  await sleep(DELAY);
  if (!body) return send(res, 400, { code: 'INVALID_BODY', message: 'Dữ liệu gửi lên không hợp lệ.' });

  const fullName = String(body.fullName ?? '').trim().replace(/\s+/g, ' ');
  const email = String(body.email ?? '').trim().toLowerCase();
  const mssv = String(body.mssv ?? '').trim();
  const errors = {};
  if (!fullName) errors.fullName = 'Vui lòng nhập họ và tên'; else if (fullName.length > 100) errors.fullName = 'Họ và tên tối đa 100 ký tự';
  if (!email) errors.email = 'Vui lòng nhập email'; else if (!EMAIL_RE.test(email)) errors.email = 'Email không đúng định dạng';
  if (!mssv) errors.mssv = 'Vui lòng nhập MSSV'; else if (!MSSV_RE.test(mssv)) errors.mssv = 'MSSV phải gồm đúng 8 chữ số';
  if (Object.keys(errors).length) return send(res, 400, { code: 'VALIDATION_FAILED', message: 'Vui lòng kiểm tra lại các trường được đánh dấu.', errors });

  const ev = events.find((e) => e.id === Number(body.eventId));
  if (!ev) return send(res, 400, { code: 'EVENT_NOT_FOUND', message: 'Sự kiện không tồn tại.', errors: { eventId: 'Sự kiện không tồn tại.' } });
  if (registrations.some((r) => r.eventId === ev.id && r.email === email)) {
    return send(res, 409, { code: 'DUPLICATE_EMAIL', message: 'Mỗi email chỉ đăng ký được một lần cho mỗi sự kiện. Hãy kiểm tra hộp thư hoặc dùng email khác.', errors: { email: 'Email này đã được dùng để đăng ký sự kiện' } });
  }
  if (dto(ev).remaining <= 0) {
    return send(res, 409, { code: 'EVENT_FULL', message: 'Rất tiếc, toàn bộ chỗ của sự kiện này đã được đăng ký. Bạn có thể xem các sự kiện khác của UIT Web Day.' });
  }
  const reg = { id: registrations.length + 1, eventId: ev.id, fullName, email, mssv, createdAt: new Date() };
  registrations.push(reg);
  res.setHeader('Location', `/api/registrations/${reg.id}`);
  send(res, 201, { id: reg.id, ticketCode: `WEB-2026-${String(reg.id).padStart(4, '0')}`, eventId: ev.id, fullName, email, event: dto(ev) });
}

function admin(res) {
  const rows = [...registrations].reverse().map((r) =>
    `<tr><td>${r.createdAt.toLocaleTimeString('vi-VN')}</td><td>${esc(r.fullName)}</td><td>${esc(r.mssv.slice(0, 4))}****</td><td>${esc(events.find((e) => e.id === r.eventId).title)}</td></tr>`).join('');
  const totals = events.map((e) => `<li>${esc(e.title)}: ${dto(e).registered}/${e.capacity}</li>`).join('');
  send(res, 200, `<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"><meta http-equiv="refresh" content="5"><title>Admin (mock)</title></head><body><h1>Admin (mock)</h1><ul>${totals}</ul><table border="1" cellpadding="6"><tr><th>Thời gian</th><th>Họ tên</th><th>MSSV</th><th>Sự kiện</th></tr>${rows}</table></body></html>`, 'text/html; charset=utf-8');
}

async function serveStatic(pathname, res) {
  const file = normalize(join(ROOT, pathname === '/' ? 'index.html' : decodeURIComponent(pathname)));
  if (!file.startsWith(ROOT)) return send(res, 403, 'Forbidden', 'text/plain');
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    send(res, 404, 'Not found', 'text/plain');
  }
}

http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && pathname === '/api/events') { await sleep(DELAY / 2); return send(res, 200, events.map(dto)); }
  if (req.method === 'POST' && pathname === '/api/registrations') return register(req, res);
  if (req.method === 'GET' && pathname === '/admin') return admin(res);
  if (req.method === 'GET') return serveStatic(pathname, res);
  send(res, 405, 'Method not allowed', 'text/plain');
}).listen(PORT, () => console.log(`Mock server: http://localhost:${PORT}  (admin: /admin)`));
