import nodemailer from 'nodemailer';
import logger from '../utils/logger.js';
import { getOrCreateSettings } from '../models/companySettings.model.js';

// Validar variáveis de ambiente SMTP
function validateSmtpConfig() {
  const required = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    logger.warn('Variáveis SMTP não configuradas', { missing });
    return false;
  }
  
  return true;
}

// Configuração do transporte de email
let transporter = null;

try {
  if (validateSmtpConfig()) {
    const port = parseInt(process.env.SMTP_PORT) || 587;
    const secure = process.env.SMTP_SECURE === 'true' || port === 465;
    
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: port,
      secure: secure, // true para 465, false para outras portas
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      // Adicionar opções para Gmail
      tls: {
        rejectUnauthorized: false // Aceitar certificados auto-assinados
      },
      // Debug: habilitar logs detalhados em desenvolvimento
      debug: process.env.NODE_ENV === 'development',
      logger: process.env.NODE_ENV === 'development'
    });
    
    logger.info('Transporte SMTP configurado', {
      host: process.env.SMTP_HOST,
      port: port,
      secure: secure,
      user: process.env.SMTP_USER ? `${process.env.SMTP_USER.substring(0, 3)}***` : 'não configurado'
    });
  } else {
    logger.warn('Transporte SMTP não configurado - emails não serão enviados');
  }
} catch (error) {
  logger.logError(error, { context: 'Erro ao configurar transporte SMTP' });
}

/**
 * Send time clock confirmation email
 * @param {Object} employee - Employee object with name and email
 * @param {Object} timeClockRecord - Time clock record
 * @param {string} type - Type of clock action: 'entry', 'lunch_exit', 'lunch_return', 'exit'
 * @returns {Promise<void>}
 */
export async function sendTimeClockEmail(employee, timeClockRecord, type) {
  try {
    // Verificar se o transporte está configurado
    if (!transporter) {
      logger.warn('Transporte SMTP não configurado - email não será enviado', {
        employeeId: employee?.id,
        employeeEmail: employee?.email
      });
      return;
    }
    
    if (!employee?.email) {
      logger.warn('Email do funcionário não encontrado', { employeeId: employee?.id });
      return;
    }
    
    // Testar conexão SMTP antes de enviar
    try {
      await transporter.verify();
      logger.debug('Conexão SMTP verificada com sucesso');
    } catch (verifyError) {
      logger.logError(verifyError, {
        context: 'Erro ao verificar conexão SMTP',
        hint: 'Verifique as credenciais SMTP no arquivo .env'
      });
      throw verifyError;
    }

    const typeLabels = {
      entry: 'Entrada',
      lunch_exit: 'Saída para Almoço',
      lunch_return: 'Volta do Almoço',
      exit: 'Saída'
    };

    const typeLabel = typeLabels[type] || 'Registro de Ponto';
    const now = new Date();

    // Buscar logo da empresa
    let logoDataUri = null;
    try {
      const settings = await getOrCreateSettings();
      if (settings?.logo) {
        const logoBuffer = Buffer.isBuffer(settings.logo) 
          ? settings.logo 
          : Buffer.from(settings.logo);
        const logoBase64 = logoBuffer.toString('base64');
        const logoContentType = settings.logoContentType || 'image/png';
        logoDataUri = `data:${logoContentType};base64,${logoBase64}`;
      }
    } catch (error) {
      logger.warn('Erro ao buscar logo para email', { error: error.message });
      // Continua sem logo se houver erro
    }

    let timeInfo = '';
    let summary = '';

    switch (type) {
      case 'entry':
        timeInfo = timeClockRecord.entryTime 
          ? new Date(timeClockRecord.entryTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
          : '-';
        summary = `Você registrou sua entrada às ${timeInfo}.`;
        break;
      case 'lunch_exit':
        timeInfo = timeClockRecord.lunchExitTime
          ? new Date(timeClockRecord.lunchExitTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
          : '-';
        summary = `Você registrou sua saída para almoço às ${timeInfo}.`;
        break;
      case 'lunch_return':
        timeInfo = timeClockRecord.lunchReturnTime
          ? new Date(timeClockRecord.lunchReturnTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
          : '-';
        summary = `Você registrou sua volta do almoço às ${timeInfo}.`;
        break;
      case 'exit':
        const exitTime = timeClockRecord.exitTime
          ? new Date(timeClockRecord.exitTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
          : '-';
        const workedHours = timeClockRecord.totalWorkedHours?.toFixed(2) || '0.00';
        const overtimeHours = timeClockRecord.overtimeHours?.toFixed(2) || '0.00';
        const lateMinutes = timeClockRecord.lateMinutes || 0;
        const lunchLateMinutes = timeClockRecord.lunchLateMinutes || 0;
        
        summary = `Você registrou sua saída às ${exitTime}.`;
        if (timeClockRecord.totalWorkedHours) {
          summary += `<br><br><strong>Horas trabalhadas:</strong> ${workedHours}h`;
        }
        if (lateMinutes > 0) {
          summary += `<br><strong>Atraso na entrada:</strong> ${lateMinutes} minutos`;
        }
        if (lunchLateMinutes > 0) {
          summary += `<br><strong>Atraso no retorno do almoço:</strong> ${lunchLateMinutes} minutos`;
        }
        if (overtimeHours > 0) {
          summary += `<br><strong>Horas extras:</strong> ${overtimeHours}h`;
        }
        if (timeClockRecord.negativeHours && timeClockRecord.negativeHours > 0) {
          summary += `<br><strong>Horas negativas:</strong> ${timeClockRecord.negativeHours.toFixed(2)}h`;
        }
        break;
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #3b82f6; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
            .logo-container { margin-bottom: 15px; }
            .logo-container img { max-height: 60px; max-width: 200px; object-fit: contain; }
            .content { background-color: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-radius: 0 0 5px 5px; }
            .info-box { background-color: white; padding: 15px; margin: 15px 0; border-left: 4px solid #3b82f6; }
            .footer { text-align: center; margin-top: 20px; color: #6b7280; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              ${logoDataUri ? `<div class="logo-container"><img src="${logoDataUri}" alt="Logo da Empresa" /></div>` : ''}
              <h1>Registro de Ponto - ${typeLabel}</h1>
            </div>
            <div class="content">
              <p>Olá, <strong>${employee.name}</strong>,</p>
              <p>Este é um comprovante automático do seu registro de ponto.</p>
              
              <div class="info-box">
                <p><strong>Data:</strong> ${now.toLocaleDateString('pt-BR')}</p>
                <p><strong>Tipo:</strong> ${typeLabel}</p>
                <p><strong>Horário:</strong> ${timeInfo}</p>
              </div>
              
              <div style="margin-top: 20px;">
                ${summary}
              </div>
              
              <div class="footer">
                <p>Este é um email automático, por favor não responda.</p>
                <p>Sistema PrimeTime - WorkHours</p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;

    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: employee.email,
      subject: `Comprovante de Ponto - ${typeLabel} - ${now.toLocaleDateString('pt-BR')}`,
      html: htmlContent,
    });

    logger.info('Email de comprovante de ponto enviado', {
      employeeId: employee.id,
      employeeEmail: employee.email,
      type,
      date: timeClockRecord.date
    });
  } catch (error) {
    // Erro específico de autenticação do Gmail
    if (error.message && error.message.includes('Invalid login')) {
      logger.error('Erro de autenticação SMTP - Credenciais inválidas', {
        employeeId: employee?.id,
        type,
        error: error.message,
        troubleshooting: {
          gmail: 'Para Gmail: 1) Ative 2FA, 2) Gere App Password em https://myaccount.google.com/apppasswords, 3) Use a App Password no SMTP_PASS',
          smtpHost: process.env.SMTP_HOST,
          smtpPort: process.env.SMTP_PORT,
          smtpUser: process.env.SMTP_USER ? `${process.env.SMTP_USER.substring(0, 3)}***` : 'não configurado'
        }
      });
    } else {
      logger.logError(error, {
        context: 'Enviar email de comprovante de ponto',
        employeeId: employee?.id,
        type
      });
    }
    // Não lançar erro para não interromper o fluxo de registro de ponto
  }
}

