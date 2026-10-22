import { IsEmail } from 'class-validator';

export class SolicitarAlteracaoEmailDto {
  @IsEmail()
  email: string;
}
