<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Carbon\Carbon;

class BuensoftImportSeeder extends Seeder
{
    public function run(): void
    {
        $membersFile     = __DIR__ . '/buensoft_members.csv';
        $membershipsFile = __DIR__ . '/buensoft_memberships.csv';

        // ── 0. Borrar socios de prueba (mantiene admins y entrenadores) ──
        $this->command->info("Eliminando socios de prueba...");
        $socioIds = DB::table('users')->where('role', 'socio')->pluck('id');
        DB::table('memberships')->whereIn('user_id', $socioIds)->delete();
        DB::table('fingerprints')->whereIn('user_id', $socioIds)->delete();
        DB::table('scan_logs')->whereIn('user_id', $socioIds)->delete();
        DB::table('reservations')->whereIn('user_id', $socioIds)->delete();
        DB::table('users')->whereIn('id', $socioIds)->delete();
        $this->command->info("  Eliminados: {$socioIds->count()} socios de prueba.\n");

        // ── 1. Leer membresías indexadas por fkMemberID ───────────────────
        $memberships = [];
        $mHandle = fopen($membershipsFile, 'r');
        $mHeader = fgetcsv($mHandle);
        $mIdx    = array_flip($mHeader);

        while (($row = fgetcsv($mHandle)) !== false) {
            $mid      = trim($row[$mIdx['fkMemberID']], '"');
            $isActive = trim($row[$mIdx['bActive']],    '"') == '1';
            $endDate  = trim($row[$mIdx['dEndDate']],   '"');

            // Guardar solo membresías activas o la más reciente por socio
            if (!isset($memberships[$mid]) || $isActive) {
                $memberships[$mid] = [
                    'plan_type'  => trim($row[$mIdx['tMembershipName']], '"'),
                    'start_date' => $this->parseDate(trim($row[$mIdx['dStartDate']], '"')),
                    'end_date'   => $this->parseDate($endDate),
                    'is_active'  => $isActive,
                ];
            }
        }
        fclose($mHandle);

        // ── 2. Leer socios activos e importar ─────────────────────────────
        $handle = fopen($membersFile, 'r');
        $header = fgetcsv($handle);
        $idx    = array_flip($header);

        $imported  = 0;
        $skipped   = 0;

        while (($row = fgetcsv($handle)) !== false) {
            $buensoftId = trim($row[$idx['pkMemberID']], '"');
            $bActive    = trim($row[$idx['bActive']],    '"');
            $bDeleted   = trim($row[$idx['bDeleted']],   '"');

            // Solo socios activos y no eliminados
            if ($bActive != '1' || $bDeleted == '1') {
                $skipped++;
                continue;
            }

            // Nombre completo
            $name = implode(' ', array_filter([
                trim($row[$idx['tName']],      '"'),
                trim($row[$idx['tLastname']],  '"'),
                trim($row[$idx['tLastname2']], '"'),
            ]));

            if (empty(trim($name))) {
                $skipped++;
                continue;
            }

            // Email (puede ser null)
            $email = trim($row[$idx['tEmail']], '"');
            $email = $email !== '' ? $email : null;

            // Teléfono (celular primero, luego casa)
            $phone = trim($row[$idx['tCellPhone']], '"');
            if ($phone === '') $phone = trim($row[$idx['tHomePhone']], '"');
            $phone = $phone !== '' ? $phone : null;

            // Dirección
            $parts   = array_filter([
                trim($row[$idx['tAddress']], '"'),
                trim($row[$idx['tColonia']], '"'),
                trim($row[$idx['tCity']],    '"'),
            ]);
            $address = !empty($parts) ? implode(', ', $parts) : null;

            // Verificar duplicado por email
            if ($email && DB::table('users')->where('email', $email)->exists()) {
                $this->command->warn("  Omitido (email duplicado): $name <$email>");
                $skipped++;
                continue;
            }

            // Crear usuario
            try {
                $userId = DB::table('users')->insertGetId([
                    'name'       => $name,
                    'username'   => 'socio' . $buensoftId,
                    'email'      => $email,
                    'phone'      => $phone,
                    'address'    => $address,
                    'password'   => Hash::make('Gym2026!'),
                    'role'       => 'socio',
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);

                // Crear membresía si existe
                if (isset($memberships[$buensoftId])) {
                    $m = $memberships[$buensoftId];
                    DB::table('memberships')->insert([
                        'user_id'    => $userId,
                        'plan_type'  => $m['plan_type'] ?: 'MENSUALIDAD',
                        'start_date' => $m['start_date'] ?? now()->toDateString(),
                        'end_date'   => $m['end_date']   ?? now()->addMonth()->toDateString(),
                        'is_active'  => $m['is_active'] ? 1 : 0,
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                }

                $imported++;
                $this->command->info("  ✓ $name (ID Buensoft: $buensoftId)");

            } catch (\Exception $e) {
                $this->command->error("  Error al importar $name: " . $e->getMessage());
                $skipped++;
            }
        }

        fclose($handle);

        $this->command->info("\n=== Importación completada ===");
        $this->command->info("  Importados: $imported");
        $this->command->info("  Omitidos:   $skipped");
        $this->command->info("  Contraseña por defecto: Gym2026!");
    }

    private function parseDate(string $raw): ?string
    {
        if (empty($raw)) return null;
        try {
            // Buensoft usa formato MM/DD/YY HH:MM:SS
            return Carbon::createFromFormat('m/d/y H:i:s', $raw)->toDateString();
        } catch (\Exception $e) {
            try {
                return Carbon::parse($raw)->toDateString();
            } catch (\Exception $e2) {
                return null;
            }
        }
    }
}
