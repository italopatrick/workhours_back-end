/**
 * Formata uma data do formato YYYY-MM-DD para DD/MM/YYYY
 * @param {string} dateStr - String de data no formato YYYY-MM-DD
 * @returns {string} - String formatada no padrão DD/MM/YYYY
 */
export function formatDateForDisplay(dateStr) {
  if (!dateStr) return '';
  
  // Divide a string de data (formato YYYY-MM-DD)
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  
  const [year, month, day] = parts;
  
  // Formata a data no padrão brasileiro (DD/MM/YYYY)
  return `${day}/${month}/${year}`;
}




