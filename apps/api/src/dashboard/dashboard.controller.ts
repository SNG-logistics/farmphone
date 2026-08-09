import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { DashboardService } from './dashboard.service';

@ApiTags('Dashboard')
@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('VIEWER')
@ApiBearerAuth()
export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  @Get()
  @ApiOperation({ summary: 'Get dashboard KPIs' })
  async getKPIs(@Req() req: any) {
    const data = await this.dashboardService.getKPIs(req.user.organizationId);
    return { success: true, data };
  }

  @Get('status')
  @ApiOperation({ summary: 'Get system status' })
  async getStatus(@Req() req: any) {
    const data = await this.dashboardService.getSystemStatus(req.user.organizationId);
    return { success: true, data };
  }

  @Get('activity')
  @ApiOperation({ summary: 'Get recent activity' })
  async getActivity(@Req() req: any) {
    const data = await this.dashboardService.getRecentActivity(req.user.organizationId);
    return { success: true, data };
  }
}
