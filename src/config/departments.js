// Mapeamento de IDs de departamento para nomes baseado na imagem fornecida
const departmentMap = {
  1: 'ADMINISTRATIVO',
  2: 'SUPORTE TÉCNICO',
  3: 'DIRETORIA',
  4: 'COMERCIAL',
  5: 'MARKETING',
  6: 'DESENVOLVIMENTO',
  7: 'IMPLANTAÇÃO',
  // Adicione outros departamentos conforme necessário
};

// Função para obter o nome do departamento a partir do ID
export const getDepartmentName = (departmentId) => {
  return departmentMap[departmentId] || 'Departamento Desconhecido';
};

export default departmentMap;
