import prisma from '../config/database.js';

/**
 * CompanySettings model helper functions using Prisma
 */

/**
 * Get or create company settings
 * @returns {Promise<Object>} Company settings
 */
export async function getOrCreateSettings() {
  let settings = await prisma.companySettings.findFirst();
  
  if (!settings) {
    settings = await prisma.companySettings.create({
      data: {
        name: '',
        reportHeader: '',
        reportFooter: '',
        defaultOvertimeLimit: 40,
        defaultAccumulationLimit: 0,
        defaultUsageLimit: 0
      }
    });
  }
  
  return settings;
}

export default prisma.companySettings;

