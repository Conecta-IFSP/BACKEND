import { IsEnum, IsMongoId, IsOptional } from 'class-validator';

import { PapelComissao } from '../schemas/comissao.schema.js';

export class AddMembroComissaoDto {
  @IsMongoId()
  usuario_id: string;

  @IsOptional()
  @IsEnum(PapelComissao)
  papel?: PapelComissao;
}
