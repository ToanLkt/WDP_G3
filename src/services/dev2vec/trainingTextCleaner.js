const cleanTrainingText = (value, maxLength = null) => {
  let text = String(value ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/https?:\/\/\S+|www\.\S+/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .replace(/\0/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  if (Number.isFinite(maxLength) && text.length > maxLength) {
    const sliced = Array.from(text).slice(0, maxLength).join('');
    const lastSpace = sliced.lastIndexOf(' ');
    text = (lastSpace > 0 ? sliced.slice(0, lastSpace) : sliced).trim();
  }
  return text;
};

module.exports = { cleanTrainingText };
