import { IsIn } from 'class-validator';
import { SituacaoReuniao } from '../schemas/reuniao.schema.js';
export class UpdateReuniaoDto {
  @IsIn([SituacaoReuniao.CANCELADA], { message: 'A reunião só pode ser cancelada' })
  situacao: SituacaoReuniao.CANCELADA;
}
