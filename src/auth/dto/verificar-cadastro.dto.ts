import { IsEmail, IsString, Length } from 'class-validator';

export class VerificarCadastroDto {
  @IsEmail({}, { message: 'Informe um e-mail válido' })
  email: string;

  @IsString({ message: 'Informe o código' })
  @Length(8, 8, { message: 'Código inválido' })
  codigo: string;
}
