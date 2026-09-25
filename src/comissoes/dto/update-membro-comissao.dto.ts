import { IsEnum } from 'class-validator';
import { PapelComissao } from '../schemas/comissao.schema.js';
export class UpdateMembroComissaoDto {
  @IsEnum(PapelComissao, { message: 'Papel deve ser MEMBRO ou RESPONSAVEL' })
  papel: PapelComissao;
}
