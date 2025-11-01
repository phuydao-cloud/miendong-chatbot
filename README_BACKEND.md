# Backend hướng dẫn nhanh

## Cài đặt
```bash
cd backend
npm i
cp .env.example .env
# Điền OPENAI_API_KEY, APP_SECRET, FIREBASE_PROJECT_ID
# và cấu hình service account
npm run dev
```

## Endpoint
- `POST /api/message` body: `{ sessionId, userMessage, meta? }`
- `GET /api/history?sessionId=...`

## Bảo mật
- Bắt buộc header `x-app-key` nếu APP_SECRET được đặt.
- Thêm rate limit (60 req/phút/IP). Có thể tích hợp Redis store.

## Ghi log Firestore
- conversations/{sessionId}/messages
- Mặc định dùng serverTimestamp.
