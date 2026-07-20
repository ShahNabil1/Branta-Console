export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      customers: {
        Row: {
          company: string | null
          converted_from_lead_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          customer_code: string
          email: string | null
          id: string
          name: string
          notes: string | null
          owner_id: string | null
          phone: string | null
          role: string | null
          service: string | null
          source: string | null
          updated_at: string
        }
        Insert: {
          company?: string | null
          converted_from_lead_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_code?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          owner_id?: string | null
          phone?: string | null
          role?: string | null
          service?: string | null
          source?: string | null
          updated_at?: string
        }
        Update: {
          company?: string | null
          converted_from_lead_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_code?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          owner_id?: string | null
          phone?: string | null
          role?: string | null
          service?: string | null
          source?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_converted_from_lead_id_fkey"
            columns: ["converted_from_lead_id"]
            isOneToOne: true
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      email_events: {
        Row: {
          created_at: string
          email: string
          event: string
          id: string
          link: string | null
          list_id: number | null
          message_id: string | null
          occurred_at: string
          raw: Json
          reason: string | null
          subject: string | null
          tag: string | null
        }
        Insert: {
          created_at?: string
          email: string
          event: string
          id?: string
          link?: string | null
          list_id?: number | null
          message_id?: string | null
          occurred_at?: string
          raw: Json
          reason?: string | null
          subject?: string | null
          tag?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          event?: string
          id?: string
          link?: string | null
          list_id?: number | null
          message_id?: string | null
          occurred_at?: string
          raw?: Json
          reason?: string | null
          subject?: string | null
          tag?: string | null
        }
        Relationships: []
      }
      impersonation_events: {
        Row: {
          action: string
          admin_email: string
          admin_user_id: string
          created_at: string
          id: string
          target_email: string
          target_user_id: string
        }
        Insert: {
          action: string
          admin_email: string
          admin_user_id: string
          created_at?: string
          id?: string
          target_email: string
          target_user_id: string
        }
        Update: {
          action?: string
          admin_email?: string
          admin_user_id?: string
          created_at?: string
          id?: string
          target_email?: string
          target_user_id?: string
        }
        Relationships: []
      }
      inbox_messages: {
        Row: {
          created_at: string
          from_email: string
          from_name: string | null
          gmail_message_id: string
          gmail_thread_id: string
          handled_by: string | null
          is_unread: boolean
          label_ids: string[]
          lead_contact_id: string | null
          lead_id: string | null
          notified: boolean
          received_at: string
          snippet: string | null
          subject: string | null
          to_email: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          from_email: string
          from_name?: string | null
          gmail_message_id: string
          gmail_thread_id: string
          handled_by?: string | null
          is_unread?: boolean
          label_ids?: string[]
          lead_contact_id?: string | null
          lead_id?: string | null
          notified?: boolean
          received_at: string
          snippet?: string | null
          subject?: string | null
          to_email?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          from_email?: string
          from_name?: string | null
          gmail_message_id?: string
          gmail_thread_id?: string
          handled_by?: string | null
          is_unread?: boolean
          label_ids?: string[]
          lead_contact_id?: string | null
          lead_id?: string | null
          notified?: boolean
          received_at?: string
          snippet?: string | null
          subject?: string | null
          to_email?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inbox_messages_lead_contact_id_fkey"
            columns: ["lead_contact_id"]
            isOneToOne: false
            referencedRelation: "lead_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbox_messages_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_sync_state: {
        Row: {
          created_at: string
          cursor: string | null
          id: string
          kind: string
          last_sync_at: string | null
          meta: Json
          resource_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          cursor?: string | null
          id?: string
          kind: string
          last_sync_at?: string | null
          meta?: Json
          resource_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          cursor?: string | null
          id?: string
          kind?: string
          last_sync_at?: string | null
          meta?: Json
          resource_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      kyc_documents: {
        Row: {
          created_at: string
          document_type: string
          id: string
          mime_type: string | null
          payload: Json
          r2_key: string | null
          r2_url: string | null
          source_url: string | null
          user_id: string
          verification_id: string | null
        }
        Insert: {
          created_at?: string
          document_type: string
          id?: string
          mime_type?: string | null
          payload?: Json
          r2_key?: string | null
          r2_url?: string | null
          source_url?: string | null
          user_id: string
          verification_id?: string | null
        }
        Update: {
          created_at?: string
          document_type?: string
          id?: string
          mime_type?: string | null
          payload?: Json
          r2_key?: string | null
          r2_url?: string | null
          source_url?: string | null
          user_id?: string
          verification_id?: string | null
        }
        Relationships: []
      }
      kyc_webhook_events: {
        Row: {
          event_id: string
          id: string
          payload_hash: string
          processed_at: string
          response: Json
          status: string | null
          user_id: string | null
          verification_id: string | null
        }
        Insert: {
          event_id: string
          id?: string
          payload_hash: string
          processed_at?: string
          response?: Json
          status?: string | null
          user_id?: string | null
          verification_id?: string | null
        }
        Update: {
          event_id?: string
          id?: string
          payload_hash?: string
          processed_at?: string
          response?: Json
          status?: string | null
          user_id?: string | null
          verification_id?: string | null
        }
        Relationships: []
      }
      lead_activities: {
        Row: {
          actor_id: string | null
          body: string | null
          created_at: string
          id: string
          kind: string
          lead_id: string
          meta: Json
        }
        Insert: {
          actor_id?: string | null
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          lead_id: string
          meta?: Json
        }
        Update: {
          actor_id?: string | null
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          lead_id?: string
          meta?: Json
        }
        Relationships: [
          {
            foreignKeyName: "lead_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_contacts: {
        Row: {
          alt_email: string | null
          alt_email_label: string | null
          alt_phone: string | null
          alt_phone_label: string | null
          contact_preference: string | null
          created_at: string
          created_by: string | null
          email: string
          email_label: string | null
          id: string
          is_primary: boolean
          label: string | null
          lead_id: string
          name: string | null
          phone: string | null
          phone_label: string | null
          role: string | null
          updated_at: string
        }
        Insert: {
          alt_email?: string | null
          alt_email_label?: string | null
          alt_phone?: string | null
          alt_phone_label?: string | null
          contact_preference?: string | null
          created_at?: string
          created_by?: string | null
          email: string
          email_label?: string | null
          id?: string
          is_primary?: boolean
          label?: string | null
          lead_id: string
          name?: string | null
          phone?: string | null
          phone_label?: string | null
          role?: string | null
          updated_at?: string
        }
        Update: {
          alt_email?: string | null
          alt_email_label?: string | null
          alt_phone?: string | null
          alt_phone_label?: string | null
          contact_preference?: string | null
          created_at?: string
          created_by?: string | null
          email?: string
          email_label?: string | null
          id?: string
          is_primary?: boolean
          label?: string | null
          lead_id?: string
          name?: string | null
          phone?: string | null
          phone_label?: string | null
          role?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_contacts_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_documents: {
        Row: {
          created_at: string
          created_by: string | null
          doc_id: string
          doc_url: string
          id: string
          lead_id: string
          template_kind: string
          title: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          doc_id: string
          doc_url: string
          id?: string
          lead_id: string
          template_kind: string
          title: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          doc_id?: string
          doc_url?: string
          id?: string
          lead_id?: string
          template_kind?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_documents_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_emails: {
        Row: {
          body_html: string | null
          body_text: string | null
          cc_emails: string[]
          created_at: string
          direction: string
          error_message: string | null
          from_email: string | null
          id: string
          lead_id: string
          message_id: string | null
          provider: string
          sent_at: string | null
          sent_by: string | null
          status: string
          subject: string | null
          thread_id: string | null
          to_emails: string[]
        }
        Insert: {
          body_html?: string | null
          body_text?: string | null
          cc_emails?: string[]
          created_at?: string
          direction: string
          error_message?: string | null
          from_email?: string | null
          id?: string
          lead_id: string
          message_id?: string | null
          provider: string
          sent_at?: string | null
          sent_by?: string | null
          status?: string
          subject?: string | null
          thread_id?: string | null
          to_emails?: string[]
        }
        Update: {
          body_html?: string | null
          body_text?: string | null
          cc_emails?: string[]
          created_at?: string
          direction?: string
          error_message?: string | null
          from_email?: string | null
          id?: string
          lead_id?: string
          message_id?: string | null
          provider?: string
          sent_at?: string | null
          sent_by?: string | null
          status?: string
          subject?: string | null
          thread_id?: string | null
          to_emails?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "lead_emails_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_meetings: {
        Row: {
          attendee_responses: Json
          attendees: string[]
          created_at: string
          created_by: string | null
          description: string | null
          ends_at: string
          google_event_id: string | null
          id: string
          lead_id: string
          meeting_link: string | null
          reminder_minutes: number
          rsvp_synced_at: string | null
          starts_at: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          attendee_responses?: Json
          attendees?: string[]
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at: string
          google_event_id?: string | null
          id?: string
          lead_id: string
          meeting_link?: string | null
          reminder_minutes?: number
          rsvp_synced_at?: string | null
          starts_at: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          attendee_responses?: Json
          attendees?: string[]
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at?: string
          google_event_id?: string | null
          id?: string
          lead_id?: string
          meeting_link?: string | null
          reminder_minutes?: number
          rsvp_synced_at?: string | null
          starts_at?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_meetings_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_service_options: {
        Row: {
          created_at: string
          is_active: boolean
          key: string
          label: string
          requires_detail: boolean
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          is_active?: boolean
          key: string
          label: string
          requires_detail?: boolean
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          is_active?: boolean
          key?: string
          label?: string
          requires_detail?: boolean
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      lead_social_links: {
        Row: {
          created_at: string
          id: string
          label: string | null
          lead_id: string
          platform: string
          sort_order: number
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          label?: string | null
          lead_id: string
          platform: string
          sort_order?: number
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string | null
          lead_id?: string
          platform?: string
          sort_order?: number
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_social_links_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_source_options: {
        Row: {
          created_at: string
          is_active: boolean
          key: string
          label: string
          requires_detail: boolean
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          is_active?: boolean
          key: string
          label: string
          requires_detail?: boolean
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          is_active?: boolean
          key?: string
          label?: string
          requires_detail?: boolean
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      lead_status_options: {
        Row: {
          color_var: string | null
          created_at: string
          is_active: boolean
          key: string
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          color_var?: string | null
          created_at?: string
          is_active?: boolean
          key: string
          label: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          color_var?: string | null
          created_at?: string
          is_active?: boolean
          key?: string
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          alt_email: string | null
          alt_email_label: string | null
          alt_phone: string | null
          alt_phone_label: string | null
          company: string | null
          contact_preference: string | null
          created_at: string
          created_by: string | null
          currency: string
          email_label: string | null
          id: string
          last_activity_at: string
          lead_code: string
          name: string
          next_action: string | null
          notes: string | null
          owner_id: string | null
          phone: string | null
          phone_label: string | null
          role: string | null
          service: string | null
          service_other: string | null
          sheet_row_id: string | null
          slug: string
          source: string | null
          source_other: string | null
          status: string
          synced_at: string | null
          updated_at: string
          value_usd: number | null
        }
        Insert: {
          alt_email?: string | null
          alt_email_label?: string | null
          alt_phone?: string | null
          alt_phone_label?: string | null
          company?: string | null
          contact_preference?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          email_label?: string | null
          id?: string
          last_activity_at?: string
          lead_code?: string
          name: string
          next_action?: string | null
          notes?: string | null
          owner_id?: string | null
          phone?: string | null
          phone_label?: string | null
          role?: string | null
          service?: string | null
          service_other?: string | null
          sheet_row_id?: string | null
          slug: string
          source?: string | null
          source_other?: string | null
          status?: string
          synced_at?: string | null
          updated_at?: string
          value_usd?: number | null
        }
        Update: {
          alt_email?: string | null
          alt_email_label?: string | null
          alt_phone?: string | null
          alt_phone_label?: string | null
          company?: string | null
          contact_preference?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          email_label?: string | null
          id?: string
          last_activity_at?: string
          lead_code?: string
          name?: string
          next_action?: string | null
          notes?: string | null
          owner_id?: string | null
          phone?: string | null
          phone_label?: string | null
          role?: string | null
          service?: string | null
          service_other?: string | null
          sheet_row_id?: string | null
          slug?: string
          source?: string | null
          source_other?: string | null
          status?: string
          synced_at?: string | null
          updated_at?: string
          value_usd?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          avatar_url: string | null
          bank_account_name: string | null
          bank_account_number: string | null
          bank_name: string | null
          bank_routing: string | null
          birth_certificate_url: string | null
          city: string | null
          country: string | null
          created_at: string
          cv_url: string | null
          didit_session_id: string | null
          district: string | null
          division: string | null
          full_name: string | null
          id: string
          identity_doc_type: string | null
          kyc_document_expiry: string | null
          kyc_document_number: string | null
          kyc_document_type: string | null
          kyc_extracted_address: string | null
          kyc_extracted_full_name: string | null
          kyc_rejection_reason: string | null
          kyc_status: string
          kyc_submitted_at: string | null
          kyc_verified_at: string | null
          legal_full_name: string | null
          mfs_number: string | null
          mfs_provider: string | null
          nid_back_url: string | null
          nid_front_url: string | null
          nid_url: string | null
          passport_address_url: string | null
          passport_photo_url: string | null
          payment_methods: Json
          personal_gmail: string | null
          phone_alt: string | null
          phone_primary: string | null
          post_office: string | null
          postcode: string | null
          upazila: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          avatar_url?: string | null
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_name?: string | null
          bank_routing?: string | null
          birth_certificate_url?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          cv_url?: string | null
          didit_session_id?: string | null
          district?: string | null
          division?: string | null
          full_name?: string | null
          id?: string
          identity_doc_type?: string | null
          kyc_document_expiry?: string | null
          kyc_document_number?: string | null
          kyc_document_type?: string | null
          kyc_extracted_address?: string | null
          kyc_extracted_full_name?: string | null
          kyc_rejection_reason?: string | null
          kyc_status?: string
          kyc_submitted_at?: string | null
          kyc_verified_at?: string | null
          legal_full_name?: string | null
          mfs_number?: string | null
          mfs_provider?: string | null
          nid_back_url?: string | null
          nid_front_url?: string | null
          nid_url?: string | null
          passport_address_url?: string | null
          passport_photo_url?: string | null
          payment_methods?: Json
          personal_gmail?: string | null
          phone_alt?: string | null
          phone_primary?: string | null
          post_office?: string | null
          postcode?: string | null
          upazila?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          avatar_url?: string | null
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_name?: string | null
          bank_routing?: string | null
          birth_certificate_url?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          cv_url?: string | null
          didit_session_id?: string | null
          district?: string | null
          division?: string | null
          full_name?: string | null
          id?: string
          identity_doc_type?: string | null
          kyc_document_expiry?: string | null
          kyc_document_number?: string | null
          kyc_document_type?: string | null
          kyc_extracted_address?: string | null
          kyc_extracted_full_name?: string | null
          kyc_rejection_reason?: string | null
          kyc_status?: string
          kyc_submitted_at?: string | null
          kyc_verified_at?: string | null
          legal_full_name?: string | null
          mfs_number?: string | null
          mfs_provider?: string | null
          nid_back_url?: string | null
          nid_front_url?: string | null
          nid_url?: string | null
          passport_address_url?: string | null
          passport_photo_url?: string | null
          payment_methods?: Json
          personal_gmail?: string | null
          phone_alt?: string | null
          phone_primary?: string | null
          post_office?: string | null
          postcode?: string | null
          upazila?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_super_admin_bypass: {
        Args: { _schema: string; _table: string }
        Returns: undefined
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_super_admin: { Args: { _user_id?: string }; Returns: boolean }
      validate_branta_email: { Args: { _email: string }; Returns: boolean }
    }
    Enums: {
      app_role: "super_admin" | "admin" | "manager" | "user"
      lead_status:
        | "new"
        | "contacted"
        | "viewed"
        | "meeting"
        | "converted"
        | "lost"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["super_admin", "admin", "manager", "user"],
      lead_status: [
        "new",
        "contacted",
        "viewed",
        "meeting",
        "converted",
        "lost",
      ],
    },
  },
} as const
