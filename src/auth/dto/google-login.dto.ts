import { IsString, IsNotEmpty, IsOptional, IsIn } from 'class-validator';

export class GoogleLoginDto {
  @IsString()
  @IsOptional()
  code?: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  redirectUri?: string;

  // Compatibilidade com clientes antigos que enviavam snake_case.
  @IsString()
  @IsOptional()
  redirect_uri?: string;

  @IsString()
  @IsOptional()
  idToken?: string;

  @IsString()
  @IsOptional()
  @IsIn(['web', 'ios', 'android'])
  plataforma?: 'web' | 'ios' | 'android';
}
