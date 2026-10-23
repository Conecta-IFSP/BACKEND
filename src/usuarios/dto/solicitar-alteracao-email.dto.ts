import { IsEmail } from 'class-validator';

export class SolicitarAlteracaoEmailDto {
  @IsEmail({}, { message: 'Informe um e-mail válido' })
  email: string;
}
