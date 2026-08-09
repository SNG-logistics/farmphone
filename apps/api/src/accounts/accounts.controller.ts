import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AccountsService } from './accounts.service';

@ApiTags('Accounts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('OPERATOR')
@Controller('accounts')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all accounts' })
  findAll() {
    return this.accountsService.findAll().then((data) => ({ success: true, data }));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get account by ID' })
  findOne(@Param('id') id: string) {
    return this.accountsService.findOne(id).then((data) => ({ success: true, data }));
  }

  @Post()
  @ApiOperation({ summary: 'Create account' })
  create(@Body() body: any) {
    return this.accountsService.create(body).then((data) => ({ success: true, data }));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update account' })
  update(@Param('id') id: string, @Body() body: any) {
    return this.accountsService.update(id, body).then((data) => ({ success: true, data }));
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete account' })
  delete(@Param('id') id: string) {
    return this.accountsService.delete(id).then((data) => ({ success: true, data }));
  }
}
