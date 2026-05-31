# GitAnalyzer AI - Mobile Application

Ứng dụng di động phân tích mã nguồn GitHub tích hợp AI Mentor hỗ trợ học tập và theo dõi lộ trình (Roadmap). Dự án được phát triển bằng **React Native** sử dụng **Expo (SDK 56)** và **TypeScript**.

---

## 🚀 Các Tính Năng Chính

- **Phân Tích Codebase (Repository Auditing)**: Đánh giá chất lượng dự án GitHub.
- **Lộ Trình Học Tập (AI Roadmap)**: Tự động khởi tạo lộ trình học tập tối ưu hóa theo kết quả phân tích.
- **Trình Quản Lý Lộ Trình**: Giao diện chọn lộ trình dạng thẻ ngang cập nhật tiến độ trực quan.
- **Social Login & Security**: Thiết kế form Đăng nhập & Đăng ký tối giản, trực quan, hỗ trợ tự động điền tài khoản thử nghiệm nhanh (Auto-fill Developer Credentials).

---

## 🛠 Yêu Cầu Hệ Thống (Prerequisites)

Trước khi chạy dự án, hãy đảm bảo máy tính của bạn đã cài đặt:
- **Node.js** (Phiên bản v18 trở lên được khuyến nghị)
- **npm** (đi kèm Node.js) hoặc **yarn**
- Thiết bị chạy thử nghiệm:
  - Máy ảo Android Emulator (thông qua Android Studio) hoặc iOS Simulator (trên macOS thông qua Xcode).
  - Hoặc ứng dụng **Expo Go** trên điện thoại cá nhân (quét mã QR để mở trực tiếp).

---

## 💻 Cài Đặt (Installation)

1. Tải các gói phụ thuộc (dependencies):
   ```bash
   npm install
   ```

2. Nếu cần cài đặt các gói bằng Yarn:
   ```bash
   yarn install
   ```

---

## 🏃 Chạy Dự Án (Running the App)

Chọn một trong các lệnh dưới đây để khởi chạy dự án:

### 1. Khởi động Metro Bundler chung:
```bash
npm run start
# hoặc
npx expo start
```
*Sau khi chạy lệnh này, bạn có thể quét mã QR hiển thị trong terminal bằng ứng dụng Expo Go trên điện thoại.*

### 2. Chạy trên máy ảo Android:
```bash
npm run android
# hoặc
npx expo start --android
```

### 3. Chạy trên máy ảo iOS:
```bash
npm run ios
# hoặc
npx expo start --ios
```

### 4. Xóa bộ nhớ đệm (Clear cache) khi gặp lỗi:
Nếu gặp lỗi cache do cài đặt lại thư viện hoặc cập nhật file cấu hình, hãy khởi chạy lại với tham số xóa cache:
```bash
npx expo start --clear
```

---

## 🔑 Tài Khoản Thử Nghiệm (Sandbox Credentials)

Để truy cập nhanh ứng dụng mà không cần đăng ký tài khoản mới:
- **Email**: `admin@wdp.com`
- **Mật khẩu**: `123456`
- *Hoặc bạn có thể bấm trực tiếp vào liên kết **"Auto-fill Developer Credentials"** ở màn hình Sign In.*
