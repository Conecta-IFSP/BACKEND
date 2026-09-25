import { IsEmail, IsOptional, IsString } from 'class-validator';

export class RecuperarContaDto {
  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  redirect_url?: string;
}
