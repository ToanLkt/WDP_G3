# GitAnalyzer AI — Mobile

Ứng dụng di động phân tích mã nguồn GitHub, tích hợp AI Mentor và lộ trình học tập. Xây dựng bằng **React Native**, **Expo SDK 56** và **TypeScript**.

---

## Tính năng

| Màn hình | Mô tả |
|---|---|
| **Home** | Tổng quan dashboard, thống kê và hành động nhanh |
| **Repositories** | Đồng bộ repo từ GitHub, tìm kiếm, xem phân tích và re-analyze |
| **Roadmap** | Danh sách lộ trình, gợi ý AI theo repo, chi tiết timeline/task |
| **AI Mentor** | Chat theo session, sidebar lịch sử, gợi ý câu hỏi |
| **Settings** | Hồ sơ sinh viên (accordion), đổi mật khẩu, trạng thái GitHub OAuth |
| **Connect GitHub** | Liên kết tài khoản qua OAuth (không cần PAT) |

---

## Yêu cầu

- **Node.js** v18+
- **npm** hoặc **yarn**
- Backend API (`WDP_G3-BE`) chạy tại port `5000`
- Một trong các môi trường chạy app:
  - Android Emulator (Android Studio)
  - iOS Simulator (macOS + Xcode)
  - Thiết bị thật với **Expo Go**

---

## Cài đặt

```bash
cd mobile
npm install
```

---

## Cấu hình môi trường

Sao chép file mẫu và chỉnh theo môi trường của bạn:

```bash
cp .env.example .env
```

| Biến | Mô tả |
|---|---|
| `EXPO_PUBLIC_API_BASE_URL` | URL backend API, mặc định `http://localhost:5000/api` |

**Android Emulator:** app tự map `localhost` → `10.0.2.2`.

**Thiết bị thật:** dùng IP LAN của máy host, ví dụ `http://192.168.1.100:5000/api`.

---

## Chạy ứng dụng

```bash
# Khởi động Metro Bundler
npm start
# hoặc
npx expo start

# Android Emulator
npm run android

# iOS Simulator (macOS)
npm run ios

# Xóa cache khi gặp lỗi bundler
npx expo start --clear
```

---

## GitHub OAuth (Android Emulator)

1. Backend cần cấu hình:
   ```
   GITHUB_CALLBACK_URL=http://localhost:5000/api/github/oauth/callback
   FRONTEND_URL=http://localhost:5000
   ```
2. Thêm cùng callback URL vào **GitHub OAuth App**.
3. Chạy port forwarding trước khi test trên emulator:

   ```powershell
   & "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" reverse tcp:5000 tcp:5000
   ```

4. Trong app: **Connect with GitHub** → authorize trên GitHub → **Refresh status**.

---

## Cấu trúc thư mục

```
mobile/
├── src/
│   ├── api/           # HTTP client & API modules
│   ├── components/    # UI components (ui/, repo/, roadmap/)
│   ├── contexts/      # AppContext, TabBarScrollContext
│   ├── features/      # Domain logic (roadmaps, …)
│   ├── hooks/         # Custom hooks
│   ├── navigation/    # AppNavigator, route types
│   ├── screens/       # auth, home, repositories, roadmap, chat, settings, …
│   ├── services/      # Business services
│   ├── theme/         # Colors, typography, spacing
│   └── types/         # Shared TypeScript types
├── App.tsx
├── app.json
└── .env.example
```

---

## Tech stack

- React Native 0.85 + React 19
- Expo 56
- React Navigation 7 (Stack + Bottom Tabs)
- lucide-react-native (icons)
- AsyncStorage (JWT persistence)

---

## Liên kết

- Backend API: nhánh `BE` trên cùng repository
- Web app: nhánh `Web` trên cùng repository
