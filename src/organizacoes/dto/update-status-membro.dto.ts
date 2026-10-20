import { IsBoolean, IsEmail, IsEnum, IsIn, IsString, MaxLength } from 'class-validator';

import { PapelOrganizacao, StatusMembroOrganizacao } from '../schemas/organizacao.schema.js';

export class UpdateStatusMembroDto {
  @IsIn([StatusMembroOrganizacao.APROVADO, StatusMembroOrganizacao.REJEITADO])
  status: StatusMembroOrganizacao;
}

export class UpdatePapelMembroDto {
  @IsEnum(PapelOrganizacao, { message: 'Papel deve ser ADMIN ou MEMBRO' })
  papel: PapelOrganizacao;
}

export class ConvidarMembroDto {
  @IsEmail({}, { message: 'Informe um e-mail válido' })
  email: string;
}

export class EntrarComCodigoDto {
  @IsString({ message: 'Informe o código' })
  @MaxLength(20, { message: 'Código inválido' })
  codigo: string;
}

export class ResponderConviteDto {
  @IsBoolean({ message: 'Informe se o convite foi aceito' })
  aceitar: boolean;
}
