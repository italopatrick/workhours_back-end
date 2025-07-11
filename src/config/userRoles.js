// Mapeamento de IDs de usuários para papéis (roles)
const adminUsers = [
  58,  // ITALO PATRICK SOUZA SILVA
  6,   // PATRICIA
  12,  // DJ
  39   // MARCUS
  // Adicione outros IDs de usuários administradores conforme necessário
];

// Função para verificar se um usuário é administrador
export const isAdminUser = (userId) => {
  return adminUsers.includes(Number(userId));
};

// Função para obter o papel (role) do usuário com base no ID
export const getUserRole = (userId) => {
  return isAdminUser(userId) ? 'admin' : 'employee';
};

export default {
  adminUsers,
  isAdminUser,
  getUserRole
};
