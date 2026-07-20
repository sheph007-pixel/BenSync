import bcrypt from "bcryptjs";
import { storage } from "./storage";
import { log } from "./index";

export async function seedDatabase() {
  try {
    const existingAdmin = await storage.getUserByEmail("admin@kennion.com");
    const hashedPassword = await bcrypt.hash("admin123", 10);
    if (!existingAdmin) {
      await storage.createUser({
        fullName: "Kennion Admin",
        email: "admin@kennion.com",
        password: hashedPassword,
        companyName: "Kennion Benefit Advisors",
        phone: null,
      });

      const admin = await storage.getUserByEmail("admin@kennion.com");
      if (admin) {
        await storage.updateUser(admin.id, { verified: true, role: "admin" });
        log("Admin account created: admin@kennion.com / admin123");
      }
    } else {
      // Always ensure admin has correct password, role, and is verified
      await storage.updateUser(existingAdmin.id, { password: hashedPassword, verified: true, role: "admin" });
      log("Admin account updated: admin@kennion.com / admin123");
    }
  } catch (err: any) {
    log(`Seed error: ${err.message}`);
  }
}
