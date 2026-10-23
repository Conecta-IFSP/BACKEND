import { IsEnum, IsMongoId, IsOptional } from 'class-validator';

import { PapelComissao } from '../schemas/comissao.schema.js';

export class AddMembroComissaoDto {
  @IsMongoId({ message: 'Selecione um usuário válido' })
  usuario_id: string;

  @IsOptional()
  @IsEnum(PapelComissao, { message: 'Papel deve ser MEMBRO ou RESPONSAVEL' })
  papel?: PapelComissao;
}
