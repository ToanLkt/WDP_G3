# GitHub OAuth Guide For Frontend

Tài liệu này chỉ mô tả 2 chức năng FE cần tích hợp:

- **Login with GitHub**: user đăng nhập hoặc tạo tài khoản bằng GitHub.
- **Connect GitHub**: user đã đăng nhập app, sau đó kết nối GitHub để hệ thống lấy repository phục vụ phân tích.

Hai chức năng này khác nhau về mục đích, endpoint bắt đầu và callback FE cần xử lý.

## 1. FE Cần Cấu Hình Gì?

Ví dụ dùng backend production trên Render:

```env
VITE_API_BASE_URL=https://career-roadmap-api-zs7y.onrender.com/api
VITE_GITHUB_AUTH_CALLBACK_URL=https://web-project-seven-rust.vercel.app/auth/github/callback
VITE_GITHUB_CONNECT_CALLBACK_URL=https://web-project-seven-rust.vercel.app/github/connect
```

Ví dụ chạy local:

```env
VITE_API_BASE_URL=http://localhost:5000/api
VITE_GITHUB_AUTH_CALLBACK_URL=http://localhost:5173/auth/github/callback
VITE_GITHUB_CONNECT_CALLBACK_URL=http://localhost:5173/github/connect
```

FE cần có 2 route:

```txt
/auth/github/callback
/github/connect
```

## 2. Login With GitHub

### Mục Đích

Dùng khi user chưa đăng nhập app và muốn đăng nhập bằng GitHub.

Kết quả cuối cùng: FE nhận được **JWT của hệ thống** trong URL hash, sau đó lưu token để gọi API protected.

### FE Gọi API Bắt Đầu Login

```http
POST /api/auth/github
```

Request body:

```json
{
  "redirectUrl": "https://web-project-seven-rust.vercel.app/auth/github/callback"
}
```

Local thì dùng:

```json
{
  "redirectUrl": "http://localhost:5173/auth/github/callback"
}
```

Response:

```json
{
  "success": true,
  "authUrl": "https://github.com/login/oauth/authorize?client_id=..."
}
```

FE redirect browser sang GitHub:

```js
window.location.href = data.authUrl;
```

### Backend Sẽ Làm Gì?

Backend sẽ:

1. Tạo GitHub OAuth `state`.
2. Redirect user sang GitHub thông qua `authUrl`.
3. Nhận callback từ GitHub.
4. Lấy thông tin GitHub user.
5. Tìm hoặc tạo user trong hệ thống.
6. Tạo JWT của hệ thống.
7. Redirect về FE route `/auth/github/callback`.

### FE Xử Lý Callback Login

Backend redirect về:

```txt
/auth/github/callback#success=true&accessToken=<JWT>&provider=github
```

FE đọc token từ `window.location.hash`:

```js
const params = new URLSearchParams(window.location.hash.replace('#', ''));
const error = new URLSearchParams(window.location.search).get('error');

if (error) {
  // Hiển thị lỗi login
  throw new Error(error);
}

const success = params.get('success');
const accessToken = params.get('accessToken');

if (success === 'true' && accessToken) {
  localStorage.setItem('accessToken', accessToken);
  window.location.href = '/dashboard';
}
```

Sau khi lưu token, FE gọi API protected bằng:

```http
Authorization: Bearer <accessToken>
```

## 3. Connect GitHub

### Mục Đích

Dùng khi user đã đăng nhập app và muốn kết nối GitHub để lấy repository.

Kết quả cuối cùng: backend lưu GitHub account/access token vào database. FE không nhận JWT mới.

### FE Gọi API Bắt Đầu Connect

```http
GET /api/github/oauth?redirectUrl=https%3A%2F%2Fweb-project-seven-rust.vercel.app%2Fgithub%2Fconnect
Authorization: Bearer <JWT>
```

Local:

```http
GET /api/github/oauth?redirectUrl=http%3A%2F%2Flocalhost%3A5173%2Fgithub%2Fconnect
Authorization: Bearer <JWT>
```

Response:

```json
{
  "success": true,
  "message": "GitHub OAuth URL generated successfully",
  "data": {
    "authorizeUrl": "https://github.com/login/oauth/authorize?client_id=..."
  },
  "errorCode": null
}
```

FE redirect browser sang GitHub:

```js
window.location.href = data.data.authorizeUrl;
```

### Backend Sẽ Làm Gì?

Backend sẽ:

1. Kiểm tra JWT hiện tại của user.
2. Tạo GitHub OAuth `state` gắn với user hiện tại.
3. Redirect user sang GitHub thông qua `authorizeUrl`.
4. Nhận callback từ GitHub.
5. Lấy GitHub access token.
6. Lưu hoặc cập nhật GitHub account của user.
7. Redirect về FE route `/github/connect`.

### FE Xử Lý Callback Connect

Backend redirect về:

```txt
/github/connect
```

Nếu lỗi:

```txt
/github/connect?error=...
```

FE xử lý:

```js
const error = new URLSearchParams(window.location.search).get('error');

if (error) {
  // Hiển thị lỗi connect GitHub
  throw new Error(error);
}

const token = localStorage.getItem('accessToken');

const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/github/me`, {
  headers: {
    Authorization: `Bearer ${token}`,
  },
});

const data = await res.json();

if (!res.ok) {
  // Hiển thị lỗi chưa connect được GitHub
  throw new Error(data.message || 'GitHub connection failed');
}

window.location.href = '/repositories';
```

Sau khi connect thành công, FE có thể lấy repository:

```http
GET /api/github/repositories
Authorization: Bearer <JWT>
```

## 4. Bảng Phân Biệt Nhanh

| Tiêu chí | Login with GitHub | Connect GitHub |
|---|---|---|
| Mục đích | Đăng nhập/tạo user | Kết nối GitHub để lấy repo |
| User cần login trước? | Không | Có |
| Endpoint bắt đầu | `POST /api/auth/github` | `GET /api/github/oauth` |
| Cần `Authorization` header? | Không | Có |
| FE callback | `/auth/github/callback` | `/github/connect` |
| FE nhận token mới? | Có, `accessToken` trong URL hash | Không |
| Sau callback FE làm gì? | Lưu token và vào dashboard | Gọi `/api/github/me` để xác nhận |

## 5. Checklist FE

FE cần đảm bảo:

1. Có env API base URL đúng môi trường.
2. Có route `/auth/github/callback`.
3. Có route `/github/connect`.
4. Login GitHub gửi `redirectUrl` là `/auth/github/callback`.
5. Connect GitHub gửi `redirectUrl` là `/github/connect`.
6. Login callback đọc token từ URL hash `#...`.
7. Connect callback không chờ token mới, mà gọi `/api/github/me`.
8. Mọi API protected sau login phải gửi:

```http
Authorization: Bearer <accessToken>
```
