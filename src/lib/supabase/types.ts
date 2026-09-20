export type UserRole = "member" | "team_lead" | "owner" | "parent";
export type Subteam =
  | "mechanical"
  | "electrical"
  | "cad"
  | "software"
  | "outreach"
  | "marketing";
export type TaskStatus = "pending" | "active" | "completed" | "archived";
export type TaskPriority = "low" | "medium" | "high";
export type VolunteerType = "parent" | "student";
export type VolunteerStatus = "confirmed" | "cancelled";
export type ScanAction = "remove" | "add" | "lost";
export type BomImportSource = "csv" | "onshape_link" | "manual";
export type BomImportStatus = "draft" | "confirmed";
export type BomLineCategory = "3d_print" | "custom_cut" | "order";
export type ThemePreference = "light" | "dark" | "system";

export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          name: string;
          username: string;
          username_lower: string;
          role: UserRole;
          role_id: string | null;
          subteam: Subteam | null;
          avatar_url: string | null;
          phone: string | null;
          bio: string | null;
          theme: ThemePreference;
          must_reset_password: boolean;
          created_at: string;
        };
        Insert: {
          id: string;
          name: string;
          username: string;
          role?: UserRole;
          role_id?: string | null;
          subteam?: Subteam | null;
          avatar_url?: string | null;
          phone?: string | null;
          bio?: string | null;
          theme?: ThemePreference;
          must_reset_password?: boolean;
        };
        Update: Partial<{
          id: string;
          name: string;
          username: string;
          role: UserRole;
          role_id: string | null;
          subteam: Subteam | null;
          avatar_url: string | null;
          phone: string | null;
          bio: string | null;
          theme: ThemePreference;
          must_reset_password: boolean;
        }>;
        Relationships: [];
      };
      roles: {
        Row: {
          id: string;
          name: string;
          maps_to: UserRole;
          is_system: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          maps_to: UserRole;
          is_system?: boolean;
        };
        Update: Partial<{
          id: string;
          name: string;
          maps_to: UserRole;
          is_system: boolean;
        }>;
        Relationships: [];
      };
      permissions: {
        Row: { key: string; label: string; description: string | null };
        Insert: { key: string; label: string; description?: string | null };
        Update: Partial<{ key: string; label: string; description: string | null }>;
        Relationships: [];
      };
      role_permissions: {
        Row: { role_id: string; permission_key: string };
        Insert: { role_id: string; permission_key: string };
        Update: Partial<{ role_id: string; permission_key: string }>;
        Relationships: [];
      };
      clock_sessions: {
        Row: {
          id: string;
          user_id: string;
          clock_in: string;
          clock_out: string | null;
          auto_clocked_out: boolean;
          catch_up_resolved: boolean;
          last_seen_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          clock_in?: string;
          clock_out?: string | null;
          auto_clocked_out?: boolean;
          catch_up_resolved?: boolean;
          last_seen_at?: string;
        };
        Update: Partial<{
          id: string;
          user_id: string;
          clock_in: string;
          clock_out: string | null;
          auto_clocked_out: boolean;
          catch_up_resolved: boolean;
          last_seen_at: string;
        }>;
        Relationships: [];
      };
      clock_session_deletions: {
        Row: {
          id: string;
          user_id: string | null;
          clock_in: string;
          clock_out: string | null;
          deleted_by: string | null;
          deleted_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          clock_in: string;
          clock_out?: string | null;
          deleted_by?: string | null;
          deleted_at?: string;
        };
        Update: Partial<{
          id: string;
          user_id: string | null;
          clock_in: string;
          clock_out: string | null;
          deleted_by: string | null;
          deleted_at: string;
        }>;
        Relationships: [];
      };
      task_projects: {
        Row: {
          id: string;
          name: string;
          deadline: string | null;
          color: string | null;
          completed_at: string | null;
          created_by: string | null;
          created_at: string;
          priority: TaskPriority;
          description: string | null;
          ongoing: boolean;
        };
        Insert: {
          id?: string;
          name: string;
          deadline?: string | null;
          color?: string | null;
          completed_at?: string | null;
          created_by?: string | null;
          priority?: TaskPriority;
          description?: string | null;
          ongoing?: boolean;
        };
        Update: Partial<{
          id: string;
          name: string;
          deadline: string | null;
          color: string | null;
          completed_at: string | null;
          created_by: string | null;
          priority: TaskPriority;
          description: string | null;
          ongoing: boolean;
        }>;
        Relationships: [];
      };
      task_project_deadline_log: {
        Row: {
          id: string;
          project_id: string;
          old_deadline: string | null;
          new_deadline: string | null;
          changed_by: string | null;
          reason: string | null;
          changed_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          old_deadline?: string | null;
          new_deadline?: string | null;
          changed_by?: string | null;
          reason?: string | null;
        };
        Update: Partial<{
          id: string;
          project_id: string;
          old_deadline: string | null;
          new_deadline: string | null;
          changed_by: string | null;
          reason: string | null;
        }>;
        Relationships: [];
      };
      tasks: {
        Row: {
          id: string;
          title: string;
          subteam: Subteam;
          deadline: string | null;
          created_by: string | null;
          created_at: string;
          status: TaskStatus;
          approved_by: string | null;
          project_id: string | null;
          description: string | null;
          priority: TaskPriority;
          ongoing: boolean;
        };
        Insert: {
          id?: string;
          title: string;
          subteam: Subteam;
          deadline?: string | null;
          created_by?: string | null;
          status?: TaskStatus;
          approved_by?: string | null;
          project_id?: string | null;
          description?: string | null;
          priority?: TaskPriority;
          ongoing?: boolean;
        };
        Update: Partial<{
          id: string;
          title: string;
          subteam: Subteam;
          deadline: string | null;
          created_by: string | null;
          status: TaskStatus;
          approved_by: string | null;
          project_id: string | null;
          description: string | null;
          priority: TaskPriority;
          ongoing: boolean;
        }>;
        Relationships: [];
      };
      task_assignees: {
        Row: {
          task_id: string;
          user_id: string;
          assigned_at: string;
        };
        Insert: {
          task_id: string;
          user_id: string;
        };
        Update: Partial<{
          task_id: string;
          user_id: string;
        }>;
        Relationships: [];
      };
      task_logs: {
        Row: {
          id: string;
          task_id: string | null;
          task_title: string | null;
          user_id: string | null;
          clock_session_id: string | null;
          timestamp: string;
          description: string | null;
          photo_url: string | null;
          photo_urls: string[];
          audio_transcript: string | null;
        };
        Insert: {
          id?: string;
          task_id?: string | null;
          task_title?: string | null;
          user_id?: string | null;
          clock_session_id?: string | null;
          timestamp?: string;
          description?: string | null;
          photo_url?: string | null;
          photo_urls?: string[];
          audio_transcript?: string | null;
        };
        Update: Partial<{
          id: string;
          task_id: string | null;
          task_title: string | null;
          user_id: string | null;
          clock_session_id: string | null;
          timestamp: string;
          description: string | null;
          photo_url: string | null;
          photo_urls: string[];
          audio_transcript: string | null;
        }>;
        Relationships: [];
      };
      events: {
        Row: {
          id: string;
          name: string;
          date: string;
          start_time: string | null;
          end_time: string | null;
          info: string | null;
          parent_slots_needed: number;
          student_slots_needed: number;
          category_id: string | null;
          visible_to: UserRole[] | null;
          recurrence_group_id: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          date: string;
          start_time?: string | null;
          end_time?: string | null;
          info?: string | null;
          parent_slots_needed?: number;
          student_slots_needed?: number;
          category_id?: string | null;
          visible_to?: UserRole[] | null;
          recurrence_group_id?: string | null;
          created_by?: string | null;
        };
        Update: Partial<{
          id: string;
          name: string;
          date: string;
          start_time: string | null;
          end_time: string | null;
          info: string | null;
          parent_slots_needed: number;
          student_slots_needed: number;
          category_id: string | null;
          visible_to: UserRole[] | null;
          recurrence_group_id: string | null;
          created_by: string | null;
        }>;
        Relationships: [];
      };
      event_categories: {
        Row: { id: string; name: string };
        Insert: { id?: string; name: string };
        Update: Partial<{ id: string; name: string }>;
        Relationships: [];
      };
      event_roles: {
        Row: {
          id: string;
          event_id: string;
          name: string;
          slots_needed: number;
        };
        Insert: {
          id?: string;
          event_id: string;
          name: string;
          slots_needed?: number;
        };
        Update: Partial<{
          id: string;
          event_id: string;
          name: string;
          slots_needed: number;
        }>;
        Relationships: [];
      };
      event_volunteers: {
        Row: {
          id: string;
          event_id: string;
          name: string;
          email: string;
          notes: string | null;
          type: VolunteerType | null;
          role_id: string | null;
          user_id: string | null;
          status: VolunteerStatus;
          cancel_reason: string | null;
          cancelled_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          event_id: string;
          name: string;
          email: string;
          notes?: string | null;
          type?: VolunteerType | null;
          role_id?: string | null;
          user_id?: string | null;
          status?: VolunteerStatus;
          cancel_reason?: string | null;
          cancelled_at?: string | null;
        };
        Update: Partial<{
          id: string;
          event_id: string;
          name: string;
          email: string;
          notes: string | null;
          type: VolunteerType | null;
          role_id: string | null;
          user_id: string | null;
          status: VolunteerStatus;
          cancel_reason: string | null;
          cancelled_at: string | null;
        }>;
        Relationships: [];
      };
      parts: {
        Row: {
          id: string;
          name: string;
          part_number: string | null;
          link: string | null;
          image_url: string | null;
          location: string | null;
          qty_in_stock: number;
          unit_cost: number | null;
          material: string | null;
          manufacturing_method: string | null;
          onshape_document_id: string | null;
          onshape_wv_type: string | null;
          onshape_wv_id: string | null;
          onshape_element_id: string | null;
          onshape_part_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          part_number?: string | null;
          link?: string | null;
          image_url?: string | null;
          location?: string | null;
          qty_in_stock?: number;
          unit_cost?: number | null;
          material?: string | null;
          manufacturing_method?: string | null;
          onshape_document_id?: string | null;
          onshape_wv_type?: string | null;
          onshape_wv_id?: string | null;
          onshape_element_id?: string | null;
          onshape_part_id?: string | null;
        };
        Update: Partial<{
          id: string;
          name: string;
          part_number: string | null;
          link: string | null;
          image_url: string | null;
          location: string | null;
          qty_in_stock: number;
          unit_cost: number | null;
          material: string | null;
          manufacturing_method: string | null;
          onshape_document_id: string | null;
          onshape_wv_type: string | null;
          onshape_wv_id: string | null;
          onshape_element_id: string | null;
          onshape_part_id: string | null;
        }>;
        Relationships: [];
      };
      projects: {
        Row: {
          id: string;
          name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
        };
        Update: Partial<{
          id: string;
          name: string;
        }>;
        Relationships: [];
      };
      subsystems: {
        Row: {
          id: string;
          project_id: string;
          name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          name: string;
        };
        Update: Partial<{
          id: string;
          project_id: string;
          name: string;
        }>;
        Relationships: [];
      };
      part_allocations: {
        Row: {
          id: string;
          part_id: string;
          project_id: string;
          qty: number;
        };
        Insert: {
          id?: string;
          part_id: string;
          project_id: string;
          qty?: number;
        };
        Update: Partial<{
          id: string;
          part_id: string;
          project_id: string;
          qty: number;
        }>;
        Relationships: [];
      };
      scan_events: {
        Row: {
          id: string;
          part_id: string;
          project_id: string | null;
          user_id: string | null;
          action: ScanAction;
          qty: number;
          timestamp: string;
        };
        Insert: {
          id?: string;
          part_id: string;
          project_id?: string | null;
          user_id?: string | null;
          action: ScanAction;
          qty?: number;
        };
        Update: Partial<{
          id: string;
          part_id: string;
          project_id: string | null;
          user_id: string | null;
          action: ScanAction;
          qty: number;
        }>;
        Relationships: [];
      };
      bom_imports: {
        Row: {
          id: string;
          project_id: string;
          subsystem_id: string | null;
          source: BomImportSource;
          source_ref: string | null;
          imported_by: string | null;
          imported_at: string;
          status: BomImportStatus;
        };
        Insert: {
          id?: string;
          project_id: string;
          subsystem_id?: string | null;
          source: BomImportSource;
          source_ref?: string | null;
          imported_by?: string | null;
          status?: BomImportStatus;
        };
        Update: Partial<{
          id: string;
          project_id: string;
          subsystem_id: string | null;
          source: BomImportSource;
          source_ref: string | null;
          imported_by: string | null;
          status: BomImportStatus;
        }>;
        Relationships: [];
      };
      bom_lines: {
        Row: {
          id: string;
          bom_import_id: string;
          subsystem_id: string | null;
          name: string;
          part_number: string | null;
          material: string | null;
          color: string | null;
          vendor_link: string | null;
          qty_needed: number;
          category: BomLineCategory;
          matched_part_id: string | null;
          qty_collect: number;
          qty_order: number;
          qty_scanned: number;
          qty_fulfilled: number;
          collected: boolean;
        };
        Insert: {
          id?: string;
          bom_import_id: string;
          subsystem_id?: string | null;
          name: string;
          part_number?: string | null;
          material?: string | null;
          color?: string | null;
          vendor_link?: string | null;
          qty_needed?: number;
          category?: BomLineCategory;
          matched_part_id?: string | null;
          qty_collect?: number;
          qty_order?: number;
          qty_scanned?: number;
          qty_fulfilled?: number;
          collected?: boolean;
        };
        Update: Partial<{
          id: string;
          bom_import_id: string;
          subsystem_id: string | null;
          name: string;
          part_number: string | null;
          material: string | null;
          color: string | null;
          vendor_link: string | null;
          qty_needed: number;
          category: BomLineCategory;
          matched_part_id: string | null;
          qty_collect: number;
          qty_order: number;
          qty_scanned: number;
          qty_fulfilled: number;
          collected: boolean;
        }>;
        Relationships: [];
      };
      vendor_orders: {
        Row: {
          id: string;
          vendor: string | null;
          order_reference: string | null;
          bom_import_id: string | null;
          imported_by: string | null;
          imported_at: string;
        };
        Insert: {
          id?: string;
          vendor?: string | null;
          order_reference?: string | null;
          bom_import_id?: string | null;
          imported_by?: string | null;
        };
        Update: Partial<{
          id: string;
          vendor: string | null;
          order_reference: string | null;
          bom_import_id: string | null;
          imported_by: string | null;
        }>;
        Relationships: [];
      };
      vendor_order_lines: {
        Row: {
          id: string;
          vendor_order_id: string;
          part_name: string;
          part_number: string | null;
          link: string | null;
          qty_ordered: number;
          matched_part_id: string | null;
        };
        Insert: {
          id?: string;
          vendor_order_id: string;
          part_name: string;
          part_number?: string | null;
          link?: string | null;
          qty_ordered?: number;
          matched_part_id?: string | null;
        };
        Update: Partial<{
          id: string;
          vendor_order_id: string;
          part_name: string;
          part_number: string | null;
          link: string | null;
          qty_ordered: number;
          matched_part_id: string | null;
        }>;
        Relationships: [];
      };
      disassembly_sessions: {
        Row: {
          id: string;
          project_id: string;
          started_by: string | null;
          started_at: string;
          completed_at: string | null;
          discrepancy_note: string | null;
        };
        Insert: {
          id?: string;
          project_id: string;
          started_by?: string | null;
          completed_at?: string | null;
          discrepancy_note?: string | null;
        };
        Update: Partial<{
          id: string;
          project_id: string;
          started_by: string | null;
          completed_at: string | null;
          discrepancy_note: string | null;
        }>;
        Relationships: [];
      };
      bom_line_files: {
        Row: {
          id: string;
          bom_line_id: string;
          url: string;
          filename: string;
          content_type: string | null;
          uploaded_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          bom_line_id: string;
          url: string;
          filename: string;
          content_type?: string | null;
          uploaded_by?: string | null;
        };
        Update: Partial<{
          id: string;
          bom_line_id: string;
          url: string;
          filename: string;
          content_type: string | null;
          uploaded_by: string | null;
        }>;
        Relationships: [];
      };
      disassembly_session_lines: {
        Row: {
          id: string;
          session_id: string;
          part_id: string;
          expected_qty: number;
          subsystem_id: string | null;
          bom_line_id: string | null;
          lost_qty: number;
        };
        Insert: {
          id?: string;
          session_id: string;
          part_id: string;
          expected_qty: number;
          subsystem_id?: string | null;
          bom_line_id?: string | null;
          lost_qty?: number;
        };
        Update: Partial<{
          id: string;
          session_id: string;
          part_id: string;
          expected_qty: number;
          subsystem_id: string | null;
          bom_line_id: string | null;
          lost_qty: number;
        }>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type UserRow = Database["public"]["Tables"]["users"]["Row"];
export type RoleRow = Database["public"]["Tables"]["roles"]["Row"];
export type PermissionRow = Database["public"]["Tables"]["permissions"]["Row"];
export type ClockSessionRow = Database["public"]["Tables"]["clock_sessions"]["Row"];
export type TaskProjectRow = Database["public"]["Tables"]["task_projects"]["Row"];
export type TaskProjectDeadlineLogRow = Database["public"]["Tables"]["task_project_deadline_log"]["Row"];
export type TaskRow = Database["public"]["Tables"]["tasks"]["Row"];
export type TaskLogRow = Database["public"]["Tables"]["task_logs"]["Row"];
export type TaskAssigneeRow = Database["public"]["Tables"]["task_assignees"]["Row"];
export type EventRow = Database["public"]["Tables"]["events"]["Row"];
export type EventCategoryRow = Database["public"]["Tables"]["event_categories"]["Row"];
export type EventRoleRow = Database["public"]["Tables"]["event_roles"]["Row"];
export type EventVolunteerRow = Database["public"]["Tables"]["event_volunteers"]["Row"];
export type PartRow = Database["public"]["Tables"]["parts"]["Row"];
export type ProjectRow = Database["public"]["Tables"]["projects"]["Row"];
export type SubsystemRow = Database["public"]["Tables"]["subsystems"]["Row"];
export type PartAllocationRow = Database["public"]["Tables"]["part_allocations"]["Row"];
export type ScanEventRow = Database["public"]["Tables"]["scan_events"]["Row"];
export type BomImportRow = Database["public"]["Tables"]["bom_imports"]["Row"];
export type BomLineRow = Database["public"]["Tables"]["bom_lines"]["Row"];
export type VendorOrderRow = Database["public"]["Tables"]["vendor_orders"]["Row"];
export type VendorOrderLineRow = Database["public"]["Tables"]["vendor_order_lines"]["Row"];
export type DisassemblySessionRow = Database["public"]["Tables"]["disassembly_sessions"]["Row"];
export type DisassemblySessionLineRow = Database["public"]["Tables"]["disassembly_session_lines"]["Row"];
export type BomLineFileRow = Database["public"]["Tables"]["bom_line_files"]["Row"];
