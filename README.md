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

## Chạy ứng dụng

```bash
# Khởi động Metro Bundler
npm start
# hoặc
npx expo start

# Android Emulator (Expo Go)
npm run android

# iOS Simulator (macOS)
npm run ios

# Native Android Build (Development Build)
npx expo run:android

# Xóa cache khi gặp lỗi bundler
npx expo start --clear

## Cấu trúc thư mục

```
mobile/
├── src/
│   ├── api/           # HTTP client & API modules
│   ├── components/    # UI components (ui/, repo/, roadmap/)
│   ├── constants/     # App constants (API URL, …)
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
