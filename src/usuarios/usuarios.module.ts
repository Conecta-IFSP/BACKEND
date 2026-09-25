import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { UsuariosController } from './usuarios.controller.js';
import { UsuariosService } from './usuarios.service.js';

import { Usuario, UsuarioSchema } from './schemas/usuario.schema.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      {
        name: Usuario.name,
        schema: UsuarioSchema,
      },
    ]),
  ],
  controllers: [UsuariosController],
  providers: [UsuariosService],
  exports: [UsuariosService],
})
export class UsuariosModule {}
