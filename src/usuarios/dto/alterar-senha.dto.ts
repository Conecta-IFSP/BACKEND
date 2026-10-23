import { IsString, MinLength } from 'class-validator';

export class AlterarSenhaDto {
  @IsString({ message: 'Informe a senha atual' })
  senha_atual: string;

  @IsString({ message: 'Informe a nova senha' })
  @MinLength(8, { message: 'A nova senha deve ter pelo menos 8 caracteres' })
  nova_senha: string;
}
