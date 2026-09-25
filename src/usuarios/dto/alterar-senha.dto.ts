import { IsString, MinLength } from 'class-validator';

export class AlterarSenhaDto {
  @IsString()
  senha_atual: string;

  @IsString()
  @MinLength(8)
  nova_senha: string;
}
