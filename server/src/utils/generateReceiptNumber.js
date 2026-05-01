exports.generateReceiptNumber = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  
  const randomDigits = Math.floor(100000 + Math.random() * 900000);
  
  return `RX-${year}${month}${day}-${randomDigits}`;
};
