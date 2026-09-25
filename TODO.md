## TODO - pra finalizar autorização

- testar `POST /auth/login`.
- proteger rotas de usuários, organizações e comissões.
- manter públicas apenas login, cadastro e recuperação de conta.
- testar token válido, inválido, expirado e usuário desativado.
- implementar autorização por papel para administradores do sistema e das organizações.

- tratar exceções com msg personalizada
  {
  "message": [
  "senha must be longer than or equal to 6 characters"
  ],
  "error": "Bad Request",
  "statusCode": 400
  }
