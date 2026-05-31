export interface ChatMessage {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  timestamp: string;
}

export const mockSendMessage = (
  message: string,
  context?: { repoId?: string; repoName?: string }
): Promise<ChatMessage> => {
  return new Promise((resolve) => {
    setTimeout(() => {
      const lowerMsg = message.toLowerCase().trim();
      let reply = '';

      if (lowerMsg.includes('cv') || lowerMsg.includes('resume') || lowerMsg.includes('xin việc')) {
        if (context?.repoName) {
          reply = `Dự án **${context.repoName}** hoàn toàn có thể đưa vào CV của bạn! Để gây ấn tượng mạnh với nhà tuyển dụng, hãy viết theo cấu trúc STAR:

1. **Situation**: Cần xây dựng ứng dụng với thiết kế tối ưu, có khả năng quản lý trạng thái mượt mà.
2. **Task**: Phát triển và cấu trúc mã nguồn theo hướng component-based, áp dụng TypeScript nghiêm ngặt.
3. **Action**: Triển khai các component UI dùng chung và viết mock API để kiểm thử tính năng hoàn chỉnh trước khi ráp backend.
4. **Result**: Tạo ra một sản phẩm mẫu chất lượng cao, giảm thiểu thời gian kiểm thử thủ công và dễ dàng mở rộng.

Bạn nên nhấn mạnh kỹ năng viết Clean Code và thiết kế cấu trúc thư mục của mình nhé!`;
        } else {
          reply = `Để đưa các dự án này vào CV một cách chuyên nghiệp nhất, bạn nên:
1. Mô tả chi tiết stack kỹ thuật chính sử dụng (ví dụ: React Native, Pinia, Rust, Docker).
2. Nêu rõ vai trò của bạn: Thiết kế cấu trúc thư mục dạng module, tự tối ưu hóa tốc độ tải trang, triển khai static/mock APIs.
3. Đưa ra các chỉ số cụ thể: số lượng component dùng chung đã đóng gói, tỉ lệ phủ mã nguồn, hoặc quy mô dự án.`;
        }
      } else if (lowerMsg.includes('mạnh') || lowerMsg.includes('skill') || lowerMsg.includes('điểm mạnh')) {
        if (context?.repoId === 'repo_1') {
          reply = `Dựa trên phân tích mã nguồn **react-native-dashboard**, điểm mạnh lớn nhất của bạn là khả năng **tổ chức giao diện người dùng (UI) tối ưu** và **quản lý luồng điều hướng phức tạp**.

Bạn nắm rất chắc kiến trúc phát triển React Native hiện đại bằng TypeScript, cấu trúc các view tách biệt và dùng Props rất chặt chẽ. Đây là kỹ năng vô cùng quan trọng đối với các Senior Mobile Developer!`;
        } else {
          reply = `Qua các repository của bạn, tôi thấy bạn có thế mạnh rất lớn về **kiến trúc mã nguồn sạch (Clean Architecture)** và **tư duy module hóa**. Bạn luôn tách biệt logic nghiệp vụ (Service layer) khỏi giao diện (Screens layer), giúp code vô cùng dễ đọc và bảo trì.`;
        }
      } else if (lowerMsg.includes('thiếu') || lowerMsg.includes('yếu') || lowerMsg.includes('missing')) {
        if (context?.repoId === 'repo_1') {
          reply = `Đối với **react-native-dashboard**, các hạng mục cốt lõi còn thiếu bao gồm:
1. **Snapshots Testing**: Chưa viết các bộ test tự động để đảm bảo các component UI không bị lệch sau khi thay đổi code.
2. **Environment config**: Chưa có tệp '.env' cấu hình an toàn cho các môi trường chạy thử.
3. **TypeScript rules**: Một số tệp vẫn sử dụng kiểu dữ liệu lỏng lẻo. Hãy kích hoạt cấu hình strict rules trong 'tsconfig.json' để nâng cao an toàn kiểu dữ liệu.`;
        } else {
          reply = `Các dự án của bạn hiện tại hoạt động rất mượt mà. Tuy nhiên, điểm chung cần cải thiện là **thiếu các kịch bản kiểm thử tự động (Unit Test/Integration Test)** và **pipeline tự động kiểm thử (CI/CD)**. Bổ sung các mảng này sẽ giúp sản phẩm của bạn đạt tiêu chuẩn doanh nghiệp.`;
        }
      } else if (lowerMsg.includes('chào') || lowerMsg.includes('hello') || lowerMsg.includes('hi')) {
        reply = `Xin chào! Tôi là AI Mentor đồng hành cùng bạn. ${context?.repoName ? `Chúng ta đang cùng xem xét repository **${context.repoName}**.` : 'Bạn có cần tôi phân tích hay hướng dẫn nâng cấp kỹ năng lập trình cho dự án nào không?'} Hãy hỏi tôi bất cứ điều gì nhé!`;
      } else {
        reply = `Cảm ơn bạn đã chia sẻ câu hỏi: *"${message}"*. 

Dưới góc độ của một Tech Lead, tôi đề xuất bạn nên tập trung vào việc **tối ưu hóa hiệu năng ứng dụng** và **áp dụng các Custom Hooks nâng cao** để giảm thiểu việc render lại không cần thiết. Nếu bạn muốn đi sâu vào bất cứ phần nào trong tech stack này, hãy báo cho tôi nhé!`;
      }

      resolve({
        id: `msg_ai_${Date.now()}`,
        text: reply,
        sender: 'ai',
        timestamp: new Date().toISOString(),
      });
    }, 1500);
  });
};
