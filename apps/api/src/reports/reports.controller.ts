import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ReportsService } from './reports.service';

@ApiTags('Reports')
@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('VIEWER')
@ApiBearerAuth()
export class ReportsController {
  constructor(private reportsService: ReportsService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Dashboard KPI report' })
  async getDashboardKPI(@Req() req: any) {
    const data = await this.reportsService.getDashboardKPI(req.user.organizationId);
    return { success: true, data };
  }

  @Get('devices')
  @ApiOperation({ summary: 'Device report' })
  async getDeviceReport(@Req() req: any) {
    const data = await this.reportsService.getDeviceReport(req.user.organizationId);
    return { success: true, data };
  }

  @Get('jobs')
  @ApiOperation({ summary: 'Job report' })
  async getJobReport(@Req() req: any) {
    const data = await this.reportsService.getJobReport(req.user.organizationId);
    return { success: true, data };
  }

  @Get('campaigns')
  @ApiOperation({ summary: 'Campaign report' })
  async getCampaignReport(@Req() req: any) {
    const data = await this.reportsService.getCampaignReport(req.user.organizationId);
    return { success: true, data };
  }

  @Get('agents')
  @ApiOperation({ summary: 'Agent report' })
  async getAgentReport(@Req() req: any) {
    const data = await this.reportsService.getAgentReport(req.user.organizationId);
    return { success: true, data };
  }
}
