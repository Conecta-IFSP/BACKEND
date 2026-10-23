import { IsEmail, IsString, Length } from 'class-validator';

export class VerificarRecuperacaoDto {
  @IsEmail({}, { message: 'Informe um e-mail válido' })
  email: string;

  @IsString({ message: 'Informe o código' })
  @Length(7, 8, { message: 'Código inválido' })
  codigo: string;
}
