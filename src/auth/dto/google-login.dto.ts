import { IsString, IsNotEmpty, IsOptional, IsIn } from 'class-validator';

export class GoogleLoginDto {
  @IsString({ message: 'Código de autorização inválido' })
  @IsOptional()
  code?: string;

  @IsString({ message: 'Endereço de retorno inválido' })
  @IsNotEmpty({ message: 'Endereço de retorno inválido' })
  @IsOptional()
  redirect_uri?: string;

  @IsString({ message: 'ID Token inválido' })
  @IsOptional()
  id_token?: string;

  @IsString({ message: 'Plataforma inválida' })
  @IsOptional()
  @IsIn(['web', 'ios', 'android'], { message: 'Plataforma deve ser web, ios ou android' })
  plataforma?: 'web' | 'ios' | 'android';
}
