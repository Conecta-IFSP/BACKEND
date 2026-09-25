import { IsEmail } from 'class-validator';

export class RecuperarContaDto {
  @IsEmail()
  email: string;
}
