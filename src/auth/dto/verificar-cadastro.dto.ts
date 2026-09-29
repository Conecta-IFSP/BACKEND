import { IsEmail, IsString, Length } from 'class-validator';

export class VerificarCadastroDto {
  @IsEmail()
  email: string;

  @IsString()
  @Length(8, 8)
  codigo: string;
}
