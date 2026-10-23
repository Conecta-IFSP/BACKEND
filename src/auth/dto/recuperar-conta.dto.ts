import { IsEmail } from 'class-validator';

export class RecuperarContaDto {
  @IsEmail({}, { message: 'Informe um e-mail válido' })
  email: string;
}
