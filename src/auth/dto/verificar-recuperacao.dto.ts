import { IsEmail, IsString, Length } from 'class-validator';

export class VerificarRecuperacaoDto {
  @IsEmail()
  email: string;

  @IsString()
  @Length(7, 8)
  codigo: string;
}
