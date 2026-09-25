import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { AdminSistemaGuard } from './admin-sistema.guard.js';

import { Usuario, UsuarioSchema } from '../usuarios/schemas/usuario.schema.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: Usuario.name,
        schema: UsuarioSchema,
      },
    ]),

    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],

      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),

        signOptions: {
          expiresIn: '1h',
        },
      }),
    }),
  ],

  controllers: [AuthController],

  providers: [AuthService, JwtAuthGuard, AdminSistemaGuard],

  exports: [AuthService, JwtModule, JwtAuthGuard, AdminSistemaGuard, MongooseModule],
})
export class AuthModule {}
