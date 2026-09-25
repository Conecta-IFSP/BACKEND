import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';

import { InjectModel } from '@nestjs/mongoose';

import { Model, Types } from 'mongoose';

import * as bcrypt from 'bcrypt';

import {
  TipoUsuario,
  Usuario,
  UsuarioDocument,
} from './schemas/usuario.schema.js';

import { CreateUsuarioDto } from './dto/create-usuario.dto.js';

import { UpdateUsuarioDto } from './dto/update-usuario.dto.js';
import { AtualizarPerfilDto } from './dto/atualizar-perfil.dto.js';
import { AlterarSenhaDto } from './dto/alterar-senha.dto.js';

const ADMIN_PADRAO = {
  nome: 'Administrador do Sistema',
  email: 'admin@admin.com',
  senha: 'Admin@123',
};

@Injectable()
export class UsuariosService implements OnApplicationBootstrap {
  constructor(
    @InjectModel(Usuario.name)
    private readonly usuarioModel: Model<UsuarioDocument>,
  ) {}

  /** Garante que sempre exista um administrador do sistema após a conexão com o banco. */
  async onApplicationBootstrap() {
    const nome = process.env.ROOT_USER_NAME?.trim() || ADMIN_PADRAO.nome;
    const email = (process.env.ROOT_USER_EMAIL?.trim() || ADMIN_PADRAO.email).toLowerCase();
    const senha = process.env.ROOT_USER_PASSWORD || ADMIN_PADRAO.senha;

    const existe = await this.usuarioModel
      .exists({
        $or: [{ tipo: TipoUsuario.ADMIN_SISTEMA }, { email }],
      })
      .exec();

    if (existe) {
      return;
    }

    await this.usuarioModel.create({
      nome,
      email,
      senha_hash: await bcrypt.hash(senha, 10),
      tipo: TipoUsuario.ADMIN_SISTEMA,
    });
  }

  async criar(createUsuarioDto: CreateUsuarioDto) {
    const email = createUsuarioDto.email.toLowerCase().trim();

    const usuarioExistente = await this.usuarioModel.findOne({ email }).exec();

    if (usuarioExistente) {
      throw new ConflictException('Já existe um usuário com este email');
    }

    const senhaHash = await bcrypt.hash(createUsuarioDto.senha, 10);

    const usuario = await this.usuarioModel.create({
      nome: createUsuarioDto.nome,
      email,
      senha_hash: senhaHash,
      tema: createUsuarioDto.tema,
    });

    return this.usuarioModel.findById(usuario._id).exec();
  }

  async listar() {
    return this.usuarioModel.find().sort({ criado_em: -1 }).exec();
  }

  async buscarPorId(id: string) {
    this.validarId(id);

    const usuario = await this.usuarioModel.findById(id).exec();

    if (!usuario) {
      throw new NotFoundException('Usuário não encontrado');
    }

    return usuario;
  }

  async atualizar(id: string, updateUsuarioDto: UpdateUsuarioDto) {
    this.validarId(id);

    const usuario = await this.usuarioModel
      .findById(id)
      .select('+senha_hash')
      .exec();

    if (!usuario) {
      throw new NotFoundException('Usuário não encontrado');
    }

    if (updateUsuarioDto.email) {
      const email = updateUsuarioDto.email.toLowerCase().trim();

      const usuarioComMesmoEmail = await this.usuarioModel
        .findOne({
          email,
          _id: { $ne: id },
        })
        .exec();

      if (usuarioComMesmoEmail) {
        throw new ConflictException('Já existe um usuário com este email');
      }

      usuario.email = email;
    }

    if (updateUsuarioDto.nome !== undefined) {
      usuario.nome = updateUsuarioDto.nome;
    }

    if (updateUsuarioDto.tipo !== undefined) {
      usuario.tipo = updateUsuarioDto.tipo;
    }

    if (updateUsuarioDto.tema !== undefined) {
      usuario.tema = updateUsuarioDto.tema;
    }

    if (updateUsuarioDto.ativo !== undefined) {
      usuario.ativo = updateUsuarioDto.ativo;
    }

    if (updateUsuarioDto.senha) {
      usuario.senha_hash = await bcrypt.hash(updateUsuarioDto.senha, 10);
    }

    await usuario.save();

    return this.usuarioModel.findById(id).exec();
  }

  async atualizarPerfil(id: string, atualizarPerfilDto: AtualizarPerfilDto) {
    this.validarId(id);

    const usuario = await this.usuarioModel.findById(id).exec();

    if (!usuario) {
      throw new NotFoundException('Usuário não encontrado');
    }

    if (atualizarPerfilDto.email) {
      const email = atualizarPerfilDto.email.toLowerCase().trim();
      const usuarioComMesmoEmail = await this.usuarioModel
        .findOne({ email, _id: { $ne: id } })
        .exec();

      if (usuarioComMesmoEmail) {
        throw new ConflictException('Já existe um usuário com este email');
      }

      usuario.email = email;
    }

    if (atualizarPerfilDto.nome !== undefined) {
      usuario.nome = atualizarPerfilDto.nome.trim();
    }

    if (atualizarPerfilDto.tema !== undefined) {
      usuario.tema = atualizarPerfilDto.tema;
    }

    await usuario.save();
    return usuario;
  }

  async alterarSenha(id: string, alterarSenhaDto: AlterarSenhaDto) {
    this.validarId(id);

    const usuario = await this.usuarioModel.findById(id).select('+senha_hash +senhaHash').exec();

    if (!usuario) {
      throw new NotFoundException('Usuário não encontrado');
    }

    const hash = usuario.senha_hash ?? usuario.senhaHash;
    if (typeof hash !== 'string' || !hash) {
      throw new BadRequestException('Use a recuperação de conta para definir sua senha');
    }
    const senhaAtualValida = await bcrypt.compare(alterarSenhaDto.senha_atual, hash);

    if (!senhaAtualValida) {
      throw new BadRequestException('A senha atual está incorreta');
    }

    const senhaRepetida = await bcrypt.compare(alterarSenhaDto.nova_senha, hash);

    if (senhaRepetida) {
      throw new BadRequestException('A nova senha deve ser diferente da senha atual');
    }

    usuario.senha_hash = await bcrypt.hash(alterarSenhaDto.nova_senha, 10);
    await usuario.save();

    return { mensagem: 'Senha alterada com sucesso' };
  }

  async remover(id: string) {
    this.validarId(id);

    const usuario = await this.usuarioModel
      .findByIdAndUpdate(
        id,
        {
          ativo: false,
        },
        {
          new: true,
        },
      )
      .exec();

    if (!usuario) {
      throw new NotFoundException('Usuário não encontrado');
    }

    return {
      mensagem: 'Usuário desativado com sucesso',
      usuario,
    };
  }

  private validarId(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('ID de usuário inválido');
    }
  }
}
