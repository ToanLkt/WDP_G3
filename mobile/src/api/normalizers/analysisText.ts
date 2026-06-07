const textMap: Record<string, string> = {
  'Repository does not show clear automated testing setup.': 'Repository chưa thể hiện rõ thiết lập kiểm thử tự động.',
  'Repository lacks strong code quality tooling signals.': 'Repository chưa có tín hiệu rõ về công cụ kiểm soát chất lượng code.',
};

const replacements: Array<[RegExp, string]> = [
  [/NÃƒÂªn bÃ¡Â»â€¢ sung unit test hoÃ¡ÂºÂ·c testing framework nhÃ†Â° Jest, Vitest, JUnit, Cypress hoÃ¡ÂºÂ·c Playwright\./g, 'Nên bổ sung unit test hoặc testing framework như Jest, Vitest, JUnit, Cypress hoặc Playwright.'],
  [/NÃƒÂªn thÃƒÂªm Dockerfile hoÃ¡ÂºÂ·c docker-compose Ã„â€˜Ã¡Â»Æ’ cÃ¡ÂºÂ£i thiÃ¡Â»â€¡n khÃ¡ÂºÂ£ nÃ„Æ’ng triÃ¡Â»Æ’n khai\./g, 'Nên thêm Dockerfile hoặc docker-compose để cải thiện khả năng triển khai.'],
  [/NÃƒÂªn thÃƒÂªm \.env\.example Ã„â€˜Ã¡Â»Æ’ ngÃ†Â°Ã¡Â»Âi khÃƒÂ¡c biÃ¡ÂºÂ¿t cÃƒÂ¡c biÃ¡ÂºÂ¿n mÃƒÂ´i trÃ†Â°Ã¡Â»Âng cÃ¡ÂºÂ§n cÃ¡ÂºÂ¥u hÃƒÂ¬nh\./g, 'Nên thêm .env.example để người khác biết các biến môi trường cần cấu hình.'],
  [/NÃƒÂªn tÃƒÂ¬m hiÃ¡Â»Æ’u GitHub Actions Ã„â€˜Ã¡Â»Æ’ tÃ¡Â»Â± Ã„â€˜Ã¡Â»â„¢ng hÃƒÂ³a kiÃ¡Â»Æ’m tra hoÃ¡ÂºÂ·c deploy\./g, 'Nên tìm hiểu GitHub Actions để tự động hóa kiểm tra hoặc deploy.'],
  [/NÃƒÂªn thÃƒÂªm ESLint\/Prettier hoÃ¡ÂºÂ·c cÃƒÂ´ng cÃ¡Â»Â¥ kiÃ¡Â»Æ’m soÃƒÂ¡t chÃ¡ÂºÂ¥t lÃ†Â°Ã¡Â»Â£ng code\./g, 'Nên thêm ESLint/Prettier hoặc công cụ kiểm soát chất lượng code.'],
  [/NÃƒÂªn viÃ¡ÂºÂ¿t README gÃ¡Â»â€œm mÃƒÂ´ tÃ¡ÂºÂ£ project, cÃƒÂ´ng nghÃ¡Â»â€¡ sÃ¡Â»Â­ dÃ¡Â»Â¥ng, cÃƒÂ¡ch cÃƒÂ i Ã„â€˜Ã¡ÂºÂ·t vÃƒÂ  cÃƒÂ¡ch chÃ¡ÂºÂ¡y\./g, 'Nên viết README gồm mô tả project, công nghệ sử dụng, cách cài đặt và cách chạy.'],
];

export const cleanAnalysisText = (value: unknown) => {
  const text = String(value ?? '').trim();
  if (!text) return '';

  const mapped = textMap[text];
  if (mapped) return mapped;

  return replacements.reduce((result, [pattern, replacement]) => {
    return result.replace(pattern, replacement);
  }, text);
};
