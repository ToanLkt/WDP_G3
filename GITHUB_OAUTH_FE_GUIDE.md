# GitHub OAuth Guide For Frontend

Tai lieu ngan gon cho FE ve 2 luong GitHub OAuth:

- **Login with GitHub**: user dang nhap/tao tai khoan bang GitHub.
- **Connect GitHub**: user da dang nhap app, sau do ket noi GitHub de lay repository.

## 1. Env FE

Production:

```env
VITE_API_BASE_URL=https://career-roadmap-api-zs7y.onrender.com/api
VITE_GITHUB_AUTH_CALLBACK_URL=https://web-project-seven-rust.vercel.app/auth/github/callback
VITE_GITHUB_CONNECT_CALLBACK_URL=https://web-project-seven-rust.vercel.app/github/connect
```

Local:

```env
VITE_API_BASE_URL=http://localhost:5000/api
VITE_GITHUB_AUTH_CALLBACK_URL=http://localhost:5173/auth/github/callback
VITE_GITHUB_CONNECT_CALLBACK_URL=http://localhost:5173/github/connect
```

FE can co 2 route:

```txt
/auth/github/callback
/github/connect
```

## 2. Login With GitHub

Dung khi user chua dang nhap app.

### Start Login

```http
POST /api/auth/github
Content-Type: application/json
```

Body:

```json
{
  "redirectUrl": "https://web-project-seven-rust.vercel.app/auth/github/callback"
}
```

Response:

```json
{
  "success": true,
  "authUrl": "https://github.com/login/oauth/authorize?..."
}
```

FE redirect browser:

```js
window.location.href = data.authUrl;
```

### Login Callback

Sau khi user approve tren GitHub, BE redirect ve:

```txt
/auth/github/callback#success=true&accessToken=<JWT>&provider=github
```

FE doc token tu `window.location.hash`:

```js
const query = new URLSearchParams(window.location.search);
const hash = new URLSearchParams(window.location.hash.slice(1));

const error = query.get('error');
if (error) {
  throw new Error(error);
}

const success = hash.get('success');
const accessToken = hash.get('accessToken');
const provider = hash.get('provider');

if (success === 'true' && accessToken && provider === 'github') {
  localStorage.setItem('accessToken', accessToken);
  window.location.href = '/dashboard';
}
```

Sau do goi API protected bang:

```http
Authorization: Bearer <accessToken>
```

## 3. Connect GitHub

Dung khi user da dang nhap app va muon ket noi GitHub de lay repositories. Luong nay **khong tra JWT moi**.

### Start Connect

```http
GET /api/github/oauth?redirectUrl=https%3A%2F%2Fweb-project-seven-rust.vercel.app%2Fgithub%2Fconnect
Authorization: Bearer <JWT>
```

Response:

```json
{
  "success": true,
  "message": "GitHub OAuth URL generated successfully",
  "data": {
    "authorizeUrl": "https://github.com/login/oauth/authorize?..."
  }
}
```

FE redirect browser:

```js
window.location.href = data.data.authorizeUrl;
```

### Connect Callback

Sau khi user approve tren GitHub, BE redirect ve:

```txt
/github/connect
```

Neu loi:

```txt
/github/connect?error=...
```

FE xu ly:

```js
const error = new URLSearchParams(window.location.search).get('error');
if (error) {
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
  throw new Error(data.message || 'GitHub connection failed');
}

window.location.href = '/repositories';
```

Sau khi connect thanh cong, FE co the lay repository:

```http
GET /api/github/repositories
Authorization: Bearer <JWT>
```

## 4. Phan Biet Nhanh

| Tieu chi | Login with GitHub | Connect GitHub |
|---|---|---|
| Muc dich | Dang nhap/tao user | Ket noi GitHub de lay repo |
| User can dang nhap truoc? | Khong | Co |
| Endpoint start | `POST /api/auth/github` | `GET /api/github/oauth` |
| Can `Authorization`? | Khong | Co |
| FE callback | `/auth/github/callback` | `/github/connect` |
| FE nhan JWT moi? | Co, trong URL hash | Khong |
| Sau callback | Luu token, vao dashboard | Goi `/api/github/me` |

## 5. Luu Y Quan Trong

- Login callback phai doc token tu hash `#...`, khong doc tu query `?...`.
- Connect callback khong co `accessToken`; dung JWT hien tai de goi `/api/github/me`.
- Backend phan biet login/connect bang OAuth `state`.
- Neu login bi redirect ve `/github/connect?error=Invalid OAuth state`, do la hanh vi backend cu. Backend hien tai da dispatch login/connect theo `state`.
