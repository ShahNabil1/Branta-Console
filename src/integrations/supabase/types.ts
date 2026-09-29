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
      client_project_activity: {
        Row: {
          action: string
          actor_id: string | null
          body: string | null
          changes: Json
          created_at: string
          customer_id: string
          id: string
          project_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          body?: string | null
          changes?: Json
          created_at?: string
          customer_id: string
          id?: string
          project_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          body?: string | null
          changes?: Json
          created_at?: string
          customer_id?: string
          id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_project_activity_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_project_activity_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "client_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      client_project_finance: {
        Row: {
          created_at: string
          currency: string
          id: string
          paid_amount: number
          payment_date: string | null
          payment_status: string
          project_id: string | null
          project_value: number
          task_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          currency?: string
          id?: string
          paid_amount?: number
          payment_date?: string | null
          payment_status?: string
          project_id?: string | null
          project_value?: number
          task_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          paid_amount?: number
          payment_date?: string | null
          payment_status?: string
          project_id?: string | null
          project_value?: number
          task_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_project_finance_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "client_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_project_finance_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: true
            referencedRelation: "client_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      client_projects: {
        Row: {
          archived_at: string | null
          assignee_id: string | null
          billing_day: number | null
          budget: number | null
          client_manager_id: string | null
          contract_end: string | null
          contract_start: string | null
          created_at: string
          created_by: string | null
          currency: string
          customer_id: string
          due_on: string | null
          id: string
          monthly_deliverables: string | null
          monthly_fee: number | null
          notes: string | null
          project_type: string
          service: string | null
          services_included: string | null
          start_time: string | null
          starts_on: string | null
          status: string
          title: string
          updated_at: string
          work_value: number | null
        }
        Insert: {
          archived_at?: string | null
          assignee_id?: string | null
          billing_day?: number | null
          budget?: number | null
          client_manager_id?: string | null
          contract_end?: string | null
          contract_start?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id: string
          due_on?: string | null
          id?: string
          monthly_deliverables?: string | null
          monthly_fee?: number | null
          notes?: string | null
          project_type?: string
          service?: string | null
          services_included?: string | null
          start_time?: string | null
          starts_on?: string | null
          status?: string
          title: string
          updated_at?: string
          work_value?: number | null
        }
        Update: {
          archived_at?: string | null
          assignee_id?: string | null
          billing_day?: number | null
          budget?: number | null
          client_manager_id?: string | null
          contract_end?: string | null
          contract_start?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: string
          due_on?: string | null
          id?: string
          monthly_deliverables?: string | null
          monthly_fee?: number | null
          notes?: string | null
          project_type?: string
          service?: string | null
          services_included?: string | null
          start_time?: string | null
          starts_on?: string | null
          status?: string
          title?: string
          updated_at?: string
          work_value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "client_projects_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      client_task_assignees: {
        Row: {
          assigned_by: string | null
          created_at: string
          done_qty: number
          id: string
          quantity: number | null
          responsibility: string | null
          status: string
          task_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string
          done_qty?: number
          id?: string
          quantity?: number | null
          responsibility?: string | null
          status?: string
          task_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_by?: string | null
          created_at?: string
          done_qty?: number
          id?: string
          quantity?: number | null
          responsibility?: string | null
          status?: string
          task_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_task_assignees_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "client_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      client_task_events: {
        Row: {
          actor_id: string | null
          created_at: string
          customer_id: string
          id: string
          meta: Json
          note: string | null
          status: string
          task_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          customer_id: string
          id?: string
          meta?: Json
          note?: string | null
          status: string
          task_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          meta?: Json
          note?: string | null
          status?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_task_events_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_task_events_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "client_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      client_task_submissions: {
        Row: {
          created_at: string
          id: string
          items_completed: number | null
          links: Json
          notes: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_by: string
          task_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          items_completed?: number | null
          links?: Json
          notes?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_by: string
          task_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          items_completed?: number | null
          links?: Json
          notes?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_by?: string
          task_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_task_submissions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "client_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      client_task_updates: {
        Row: {
          author_id: string
          body: string
          created_at: string
          edited_at: string | null
          id: string
          is_manager: boolean
          items_done: number | null
          task_id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          edited_at?: string | null
          id?: string
          is_manager?: boolean
          items_done?: number | null
          task_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          edited_at?: string | null
          id?: string
          is_manager?: boolean
          items_done?: number | null
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_task_updates_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "client_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      client_tasks: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          due_on: string | null
          id: string
          instructions: string | null
          output_unit: string | null
          per_unit_output: number | null
          priority: string
          project_id: string | null
          quantity: number | null
          revision_round: number
          status: string
          title: string
          total_output: number | null
          unit: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          due_on?: string | null
          id?: string
          instructions?: string | null
          output_unit?: string | null
          per_unit_output?: number | null
          priority?: string
          project_id?: string | null
          quantity?: number | null
          revision_round?: number
          status?: string
          title: string
          total_output?: number | null
          unit?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          due_on?: string | null
          id?: string
          instructions?: string | null
          output_unit?: string | null
          per_unit_output?: number | null
          priority?: string
          project_id?: string | null
          quantity?: number | null
          revision_round?: number
          status?: string
          title?: string
          total_output?: number | null
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_tasks_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "client_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      company_ledger: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          currency: string
          id: string
          kind: string
          notes: string | null
          occurred_on: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          kind: string
          notes?: string | null
          occurred_on?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          kind?: string
          notes?: string | null
          occurred_on?: string
          updated_at?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          address: string | null
          client_since: string
          company: string | null
          contact_person: string | null
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
          whatsapp: string | null
        }
        Insert: {
          address?: string | null
          client_since?: string
          company?: string | null
          contact_person?: string | null
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
          whatsapp?: string | null
        }
        Update: {
          address?: string | null
          client_since?: string
          company?: string | null
          contact_person?: string | null
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
          whatsapp?: string | null
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
      employee_fund_payments: {
        Row: {
          amount: number
          cancel_reason: string | null
          created_at: string
          created_by: string | null
          description: string | null
          employee_id: string
          id: string
          invoice_id: string | null
          invoice_payout_id: string | null
          notes: string | null
          paid_at: string | null
          payment_method: string | null
          payment_type: string
          project_id: string | null
          salary_slip_id: string | null
          status: string
          task_id: string | null
          transaction_reference: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          cancel_reason?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          employee_id: string
          id?: string
          invoice_id?: string | null
          invoice_payout_id?: string | null
          notes?: string | null
          paid_at?: string | null
          payment_method?: string | null
          payment_type: string
          project_id?: string | null
          salary_slip_id?: string | null
          status?: string
          task_id?: string | null
          transaction_reference?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          cancel_reason?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          employee_id?: string
          id?: string
          invoice_id?: string | null
          invoice_payout_id?: string | null
          notes?: string | null
          paid_at?: string | null
          payment_method?: string | null
          payment_type?: string
          project_id?: string | null
          salary_slip_id?: string | null
          status?: string
          task_id?: string | null
          transaction_reference?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_fund_payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_fund_payments_invoice_payout_id_fkey"
            columns: ["invoice_payout_id"]
            isOneToOne: false
            referencedRelation: "invoice_payouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_fund_payments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "client_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_fund_payments_salary_slip_id_fkey"
            columns: ["salary_slip_id"]
            isOneToOne: false
            referencedRelation: "salary_slips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_fund_payments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "client_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_activity_logs: {
        Row: {
          action: string
          actor_id: string | null
          changes: Json
          created_at: string
          expense_id: string | null
          id: string
          metadata: Json
          reason: string | null
          title: string
          voucher_no: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          changes?: Json
          created_at?: string
          expense_id?: string | null
          id?: string
          metadata?: Json
          reason?: string | null
          title: string
          voucher_no?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          changes?: Json
          created_at?: string
          expense_id?: string | null
          id?: string
          metadata?: Json
          reason?: string | null
          title?: string
          voucher_no?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expense_activity_logs_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_attachments: {
        Row: {
          caption: string | null
          created_at: string
          created_by: string | null
          expense_id: string
          id: string
          kind: string
          mime_type: string | null
          path: string
          sequence: number
          size_bytes: number | null
          updated_at: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          created_by?: string | null
          expense_id: string
          id?: string
          kind?: string
          mime_type?: string | null
          path: string
          sequence?: number
          size_bytes?: number | null
          updated_at?: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          created_by?: string | null
          expense_id?: string
          id?: string
          kind?: string
          mime_type?: string | null
          path?: string
          sequence?: number
          size_bytes?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_attachments_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_items: {
        Row: {
          amount: number
          created_at: string
          expense_id: string
          id: string
          name: string
          note: string | null
          quantity: number
          sequence: number
          unit: string | null
          unit_price: number
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          expense_id: string
          id?: string
          name: string
          note?: string | null
          quantity?: number
          sequence?: number
          unit?: string | null
          unit_price?: number
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          expense_id?: string
          id?: string
          name?: string
          note?: string | null
          quantity?: number
          sequence?: number
          unit?: string | null
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_items_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category: Database["public"]["Enums"]["expense_category"]
          created_at: string
          created_by: string | null
          currency: string
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          department: string | null
          fund_id: string | null
          id: string
          is_project_cost: boolean
          last_edit_reason: string | null
          linked_invoice_id: string | null
          notes: string | null
          paid_by: string | null
          payment_method: string | null
          purge_after: string | null
          receipt_url: string | null
          request_purpose: string | null
          requested_by: string | null
          share_enabled: boolean
          share_token: string | null
          signed_voucher_at: string | null
          signed_voucher_by: string | null
          signed_voucher_url: string | null
          spent_on: string
          txn_id: string | null
          updated_at: string
          vendor: string | null
          voucher_no: string | null
        }
        Insert: {
          amount: number
          category: Database["public"]["Enums"]["expense_category"]
          created_at?: string
          created_by?: string | null
          currency?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          department?: string | null
          fund_id?: string | null
          id?: string
          is_project_cost?: boolean
          last_edit_reason?: string | null
          linked_invoice_id?: string | null
          notes?: string | null
          paid_by?: string | null
          payment_method?: string | null
          purge_after?: string | null
          receipt_url?: string | null
          request_purpose?: string | null
          requested_by?: string | null
          share_enabled?: boolean
          share_token?: string | null
          signed_voucher_at?: string | null
          signed_voucher_by?: string | null
          signed_voucher_url?: string | null
          spent_on?: string
          txn_id?: string | null
          updated_at?: string
          vendor?: string | null
          voucher_no?: string | null
        }
        Update: {
          amount?: number
          category?: Database["public"]["Enums"]["expense_category"]
          created_at?: string
          created_by?: string | null
          currency?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          department?: string | null
          fund_id?: string | null
          id?: string
          is_project_cost?: boolean
          last_edit_reason?: string | null
          linked_invoice_id?: string | null
          notes?: string | null
          paid_by?: string | null
          payment_method?: string | null
          purge_after?: string | null
          receipt_url?: string | null
          request_purpose?: string | null
          requested_by?: string | null
          share_enabled?: boolean
          share_token?: string | null
          signed_voucher_at?: string | null
          signed_voucher_by?: string | null
          signed_voucher_url?: string | null
          spent_on?: string
          txn_id?: string | null
          updated_at?: string
          vendor?: string | null
          voucher_no?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "finance_funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "fund_balances"
            referencedColumns: ["fund_id"]
          },
          {
            foreignKeyName: "expenses_linked_invoice_id_fkey"
            columns: ["linked_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_funds: {
        Row: {
          code: string
          created_at: string
          description: string | null
          display_order: number
          id: string
          is_active: boolean
          kind: string
          name: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          kind?: string
          name: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          kind?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      fund_allocation_version_items: {
        Row: {
          fund_id: string
          id: string
          percent: number
          version_id: string
        }
        Insert: {
          fund_id: string
          id?: string
          percent: number
          version_id: string
        }
        Update: {
          fund_id?: string
          id?: string
          percent?: number
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fund_allocation_version_items_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "finance_funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fund_allocation_version_items_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "fund_balances"
            referencedColumns: ["fund_id"]
          },
          {
            foreignKeyName: "fund_allocation_version_items_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "fund_allocation_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      fund_allocation_versions: {
        Row: {
          created_at: string
          created_by: string | null
          effective_from: string
          id: string
          name: string
          notes: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          effective_from: string
          id?: string
          name: string
          notes?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          effective_from?: string
          id?: string
          name?: string
          notes?: string | null
        }
        Relationships: []
      }
      fund_audit_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          next: Json | null
          previous: Json | null
          reason: string | null
          record_id: string | null
          record_type: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          next?: Json | null
          previous?: Json | null
          reason?: string | null
          record_id?: string | null
          record_type?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          next?: Json | null
          previous?: Json | null
          reason?: string | null
          record_id?: string | null
          record_type?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      fund_deduction_rules: {
        Row: {
          amount_type: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
          value: number
        }
        Insert: {
          amount_type: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
          value: number
        }
        Update: {
          amount_type?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          value?: number
        }
        Relationships: []
      }
      fund_ledger: {
        Row: {
          allocation_id: string | null
          amount: number
          created_at: string
          created_by: string | null
          customer_id: string | null
          description: string | null
          direction: string
          employee_id: string | null
          expense_id: string | null
          fund_id: string
          id: string
          installment_id: string | null
          invoice_id: string | null
          invoice_payout_id: string | null
          loan_id: string | null
          notes: string | null
          project_id: string | null
          reference: string | null
          reversal_of: string | null
          salary_slip_id: string | null
          transaction_type: string
          transfer_id: string | null
        }
        Insert: {
          allocation_id?: string | null
          amount: number
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          description?: string | null
          direction: string
          employee_id?: string | null
          expense_id?: string | null
          fund_id: string
          id?: string
          installment_id?: string | null
          invoice_id?: string | null
          invoice_payout_id?: string | null
          loan_id?: string | null
          notes?: string | null
          project_id?: string | null
          reference?: string | null
          reversal_of?: string | null
          salary_slip_id?: string | null
          transaction_type: string
          transfer_id?: string | null
        }
        Update: {
          allocation_id?: string | null
          amount?: number
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          description?: string | null
          direction?: string
          employee_id?: string | null
          expense_id?: string | null
          fund_id?: string
          id?: string
          installment_id?: string | null
          invoice_id?: string | null
          invoice_payout_id?: string | null
          loan_id?: string | null
          notes?: string | null
          project_id?: string | null
          reference?: string | null
          reversal_of?: string | null
          salary_slip_id?: string | null
          transaction_type?: string
          transfer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fund_ledger_allocation_id_fkey"
            columns: ["allocation_id"]
            isOneToOne: false
            referencedRelation: "installment_allocations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fund_ledger_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "finance_funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fund_ledger_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "fund_balances"
            referencedColumns: ["fund_id"]
          },
          {
            foreignKeyName: "fund_ledger_reversal_of_fkey"
            columns: ["reversal_of"]
            isOneToOne: false
            referencedRelation: "fund_ledger"
            referencedColumns: ["id"]
          },
        ]
      }
      fund_loan_repayments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          id: string
          loan_id: string
          notes: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          id?: string
          loan_id: string
          notes?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          loan_id?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fund_loan_repayments_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "fund_loans"
            referencedColumns: ["id"]
          },
        ]
      }
      fund_loans: {
        Row: {
          created_at: string
          created_by: string | null
          from_fund_id: string
          id: string
          linked_expense_id: string | null
          principal_amount: number
          reason: string
          repaid_amount: number
          status: string
          to_fund_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          from_fund_id: string
          id?: string
          linked_expense_id?: string | null
          principal_amount: number
          reason: string
          repaid_amount?: number
          status?: string
          to_fund_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          from_fund_id?: string
          id?: string
          linked_expense_id?: string | null
          principal_amount?: number
          reason?: string
          repaid_amount?: number
          status?: string
          to_fund_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fund_loans_from_fund_id_fkey"
            columns: ["from_fund_id"]
            isOneToOne: false
            referencedRelation: "finance_funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fund_loans_from_fund_id_fkey"
            columns: ["from_fund_id"]
            isOneToOne: false
            referencedRelation: "fund_balances"
            referencedColumns: ["fund_id"]
          },
          {
            foreignKeyName: "fund_loans_linked_expense_id_fkey"
            columns: ["linked_expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fund_loans_to_fund_id_fkey"
            columns: ["to_fund_id"]
            isOneToOne: false
            referencedRelation: "finance_funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fund_loans_to_fund_id_fkey"
            columns: ["to_fund_id"]
            isOneToOne: false
            referencedRelation: "fund_balances"
            referencedColumns: ["fund_id"]
          },
        ]
      }
      fund_transfers: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          from_fund_id: string
          id: string
          linked_expense_id: string | null
          reason: string
          to_fund_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          from_fund_id: string
          id?: string
          linked_expense_id?: string | null
          reason: string
          to_fund_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          from_fund_id?: string
          id?: string
          linked_expense_id?: string | null
          reason?: string
          to_fund_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fund_transfers_from_fund_id_fkey"
            columns: ["from_fund_id"]
            isOneToOne: false
            referencedRelation: "finance_funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fund_transfers_from_fund_id_fkey"
            columns: ["from_fund_id"]
            isOneToOne: false
            referencedRelation: "fund_balances"
            referencedColumns: ["fund_id"]
          },
          {
            foreignKeyName: "fund_transfers_linked_expense_id_fkey"
            columns: ["linked_expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fund_transfers_to_fund_id_fkey"
            columns: ["to_fund_id"]
            isOneToOne: false
            referencedRelation: "finance_funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fund_transfers_to_fund_id_fkey"
            columns: ["to_fund_id"]
            isOneToOne: false
            referencedRelation: "fund_balances"
            referencedColumns: ["fund_id"]
          },
        ]
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
      income_vouchers: {
        Row: {
          amount: number
          category: string
          created_at: string
          created_by: string | null
          currency: string
          customer_id: string | null
          id: string
          invoice_id: string | null
          notes: string | null
          party: string | null
          payment_method: string | null
          project: string | null
          received_on: string
          signed_voucher_at: string | null
          signed_voucher_by: string | null
          signed_voucher_url: string | null
          source: string
          source_id: string
          txn_id: string | null
          updated_at: string
          voucher_no: string | null
        }
        Insert: {
          amount: number
          category?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: string | null
          id?: string
          invoice_id?: string | null
          notes?: string | null
          party?: string | null
          payment_method?: string | null
          project?: string | null
          received_on: string
          signed_voucher_at?: string | null
          signed_voucher_by?: string | null
          signed_voucher_url?: string | null
          source: string
          source_id: string
          txn_id?: string | null
          updated_at?: string
          voucher_no?: string | null
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: string | null
          id?: string
          invoice_id?: string | null
          notes?: string | null
          party?: string | null
          payment_method?: string | null
          project?: string | null
          received_on?: string
          signed_voucher_at?: string | null
          signed_voucher_by?: string | null
          signed_voucher_url?: string | null
          source?: string
          source_id?: string
          txn_id?: string | null
          updated_at?: string
          voucher_no?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "income_vouchers_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "income_vouchers_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      installment_allocation_deductions: {
        Row: {
          allocation_id: string
          amount: number
          amount_type: string
          id: string
          name: string
          value: number
        }
        Insert: {
          allocation_id: string
          amount: number
          amount_type: string
          id?: string
          name: string
          value: number
        }
        Update: {
          allocation_id?: string
          amount?: number
          amount_type?: string
          id?: string
          name?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "installment_allocation_deductions_allocation_id_fkey"
            columns: ["allocation_id"]
            isOneToOne: false
            referencedRelation: "installment_allocations"
            referencedColumns: ["id"]
          },
        ]
      }
      installment_allocation_failures: {
        Row: {
          attempts: number
          error: string | null
          installment_id: string
          last_attempt_at: string
        }
        Insert: {
          attempts?: number
          error?: string | null
          installment_id: string
          last_attempt_at?: string
        }
        Update: {
          attempts?: number
          error?: string | null
          installment_id?: string
          last_attempt_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "installment_allocation_failures_installment_id_fkey"
            columns: ["installment_id"]
            isOneToOne: true
            referencedRelation: "invoice_installments"
            referencedColumns: ["id"]
          },
        ]
      }
      installment_allocation_items: {
        Row: {
          allocation_id: string
          amount: number
          fund_id: string
          fund_name: string
          id: string
          percent: number
        }
        Insert: {
          allocation_id: string
          amount: number
          fund_id: string
          fund_name: string
          id?: string
          percent: number
        }
        Update: {
          allocation_id?: string
          amount?: number
          fund_id?: string
          fund_name?: string
          id?: string
          percent?: number
        }
        Relationships: [
          {
            foreignKeyName: "installment_allocation_items_allocation_id_fkey"
            columns: ["allocation_id"]
            isOneToOne: false
            referencedRelation: "installment_allocations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installment_allocation_items_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "finance_funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installment_allocation_items_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "fund_balances"
            referencedColumns: ["fund_id"]
          },
        ]
      }
      installment_allocations: {
        Row: {
          created_at: string
          created_by: string | null
          customer_id: string | null
          deduction_total: number
          distributable_amount: number
          error: string | null
          id: string
          installment_id: string
          invoice_id: string
          project_id: string | null
          received_amount: number
          replaces_allocation_id: string | null
          reversal_reason: string | null
          reversed_at: string | null
          reversed_by: string | null
          source: string
          status: string
          version_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          deduction_total?: number
          distributable_amount: number
          error?: string | null
          id?: string
          installment_id: string
          invoice_id: string
          project_id?: string | null
          received_amount: number
          replaces_allocation_id?: string | null
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          source?: string
          status?: string
          version_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          deduction_total?: number
          distributable_amount?: number
          error?: string | null
          id?: string
          installment_id?: string
          invoice_id?: string
          project_id?: string | null
          received_amount?: number
          replaces_allocation_id?: string | null
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          source?: string
          status?: string
          version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "installment_allocations_installment_id_fkey"
            columns: ["installment_id"]
            isOneToOne: false
            referencedRelation: "invoice_installments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installment_allocations_replaces_allocation_id_fkey"
            columns: ["replaces_allocation_id"]
            isOneToOne: false
            referencedRelation: "installment_allocations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installment_allocations_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "fund_allocation_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      installment_deductions: {
        Row: {
          amount_type: string
          created_at: string
          created_by: string | null
          deduction_type: string
          description: string | null
          id: string
          installment_id: string
          notes: string | null
          value: number
        }
        Insert: {
          amount_type: string
          created_at?: string
          created_by?: string | null
          deduction_type?: string
          description?: string | null
          id?: string
          installment_id: string
          notes?: string | null
          value: number
        }
        Update: {
          amount_type?: string
          created_at?: string
          created_by?: string | null
          deduction_type?: string
          description?: string | null
          id?: string
          installment_id?: string
          notes?: string | null
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "installment_deductions_installment_id_fkey"
            columns: ["installment_id"]
            isOneToOne: false
            referencedRelation: "invoice_installments"
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
      invoice_activity_logs: {
        Row: {
          action: string
          actor_id: string | null
          body: string | null
          created_at: string
          deep_link: string | null
          id: string
          invoice_id: string | null
          invoice_slug: string
          metadata: Json
          related_id: string | null
          related_table: string | null
          title: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          body?: string | null
          created_at?: string
          deep_link?: string | null
          id?: string
          invoice_id?: string | null
          invoice_slug: string
          metadata?: Json
          related_id?: string | null
          related_table?: string | null
          title: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          body?: string | null
          created_at?: string
          deep_link?: string | null
          id?: string
          invoice_id?: string | null
          invoice_slug?: string
          metadata?: Json
          related_id?: string | null
          related_table?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_activity_logs_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_email_events: {
        Row: {
          bounced_at: string | null
          created_at: string
          delivered_at: string | null
          error_message: string | null
          id: string
          installment_id: string | null
          invoice_id: string
          meta: Json
          opened_at: string | null
          provider_message_id: string | null
          recipient_email: string
          recipient_name: string | null
          sent_by: string | null
          status: Database["public"]["Enums"]["invoice_email_status"]
          subject: string
          trigger: Database["public"]["Enums"]["invoice_email_trigger"]
          updated_at: string
        }
        Insert: {
          bounced_at?: string | null
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          installment_id?: string | null
          invoice_id: string
          meta?: Json
          opened_at?: string | null
          provider_message_id?: string | null
          recipient_email: string
          recipient_name?: string | null
          sent_by?: string | null
          status?: Database["public"]["Enums"]["invoice_email_status"]
          subject: string
          trigger?: Database["public"]["Enums"]["invoice_email_trigger"]
          updated_at?: string
        }
        Update: {
          bounced_at?: string | null
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          installment_id?: string | null
          invoice_id?: string
          meta?: Json
          opened_at?: string | null
          provider_message_id?: string | null
          recipient_email?: string
          recipient_name?: string | null
          sent_by?: string | null
          status?: Database["public"]["Enums"]["invoice_email_status"]
          subject?: string
          trigger?: Database["public"]["Enums"]["invoice_email_trigger"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_email_events_installment_id_fkey"
            columns: ["installment_id"]
            isOneToOne: false
            referencedRelation: "invoice_installments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_email_events_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_email_settings: {
        Row: {
          auto_send_on_create: boolean
          auto_send_on_fully_paid: boolean
          auto_send_on_installment_paid: boolean
          background_color: string
          body_html: string
          brand_color: string
          card_background: string
          created_at: string
          cta_label: string
          footer_html: string
          from_email: string
          from_name: string
          header_html: string
          id: string
          reminder_body_html: string
          reminder_days_overdue: string
          reminder_days_upcoming: string
          reminder_subject_template: string
          reminders_enabled: boolean
          reply_to: string | null
          subject_template: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          auto_send_on_create?: boolean
          auto_send_on_fully_paid?: boolean
          auto_send_on_installment_paid?: boolean
          background_color?: string
          body_html?: string
          brand_color?: string
          card_background?: string
          created_at?: string
          cta_label?: string
          footer_html?: string
          from_email?: string
          from_name?: string
          header_html?: string
          id?: string
          reminder_body_html?: string
          reminder_days_overdue?: string
          reminder_days_upcoming?: string
          reminder_subject_template?: string
          reminders_enabled?: boolean
          reply_to?: string | null
          subject_template?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          auto_send_on_create?: boolean
          auto_send_on_fully_paid?: boolean
          auto_send_on_installment_paid?: boolean
          background_color?: string
          body_html?: string
          brand_color?: string
          card_background?: string
          created_at?: string
          cta_label?: string
          footer_html?: string
          from_email?: string
          from_name?: string
          header_html?: string
          id?: string
          reminder_body_html?: string
          reminder_days_overdue?: string
          reminder_days_upcoming?: string
          reminder_subject_template?: string
          reminders_enabled?: boolean
          reply_to?: string | null
          subject_template?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      invoice_installments: {
        Row: {
          amount: number
          created_at: string
          due_date: string
          id: string
          invoice_id: string
          label: string
          note: string | null
          paid_amount: number | null
          paid_at: string | null
          payment_method: string | null
          payment_ref: string | null
          sequence: number
          status: Database["public"]["Enums"]["installment_status"]
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          due_date: string
          id?: string
          invoice_id: string
          label: string
          note?: string | null
          paid_amount?: number | null
          paid_at?: string | null
          payment_method?: string | null
          payment_ref?: string | null
          sequence: number
          status?: Database["public"]["Enums"]["installment_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          due_date?: string
          id?: string
          invoice_id?: string
          label?: string
          note?: string | null
          paid_amount?: number | null
          paid_at?: string | null
          payment_method?: string | null
          payment_ref?: string | null
          sequence?: number
          status?: Database["public"]["Enums"]["installment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_installments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_line_items: {
        Row: {
          created_at: string
          description: string
          id: string
          invoice_id: string
          quantity: number
          sequence: number
          unit_price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          invoice_id: string
          quantity?: number
          sequence?: number
          unit_price?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          quantity?: number
          sequence?: number
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_line_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_payouts: {
        Row: {
          amount: number
          created_at: string
          currency: string
          id: string
          installment_id: string | null
          invoice_id: string | null
          kind: string | null
          notes: string | null
          paid_at: string | null
          requested_at: string | null
          role: Database["public"]["Enums"]["stakeholder_role"]
          source: string
          stakeholder_id: string | null
          status: Database["public"]["Enums"]["payout_status"]
          unlocked_at: string | null
          updated_at: string
          user_id: string
          withdrawal_request_id: string | null
        }
        Insert: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          installment_id?: string | null
          invoice_id?: string | null
          kind?: string | null
          notes?: string | null
          paid_at?: string | null
          requested_at?: string | null
          role: Database["public"]["Enums"]["stakeholder_role"]
          source?: string
          stakeholder_id?: string | null
          status?: Database["public"]["Enums"]["payout_status"]
          unlocked_at?: string | null
          updated_at?: string
          user_id: string
          withdrawal_request_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          installment_id?: string | null
          invoice_id?: string | null
          kind?: string | null
          notes?: string | null
          paid_at?: string | null
          requested_at?: string | null
          role?: Database["public"]["Enums"]["stakeholder_role"]
          source?: string
          stakeholder_id?: string | null
          status?: Database["public"]["Enums"]["payout_status"]
          unlocked_at?: string | null
          updated_at?: string
          user_id?: string
          withdrawal_request_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_payouts_installment_id_fkey"
            columns: ["installment_id"]
            isOneToOne: false
            referencedRelation: "invoice_installments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_payouts_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_payouts_stakeholder_id_fkey"
            columns: ["stakeholder_id"]
            isOneToOne: false
            referencedRelation: "invoice_stakeholders"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_pdf_settings: {
        Row: {
          brand_color: string
          company_address: string | null
          company_email: string | null
          company_name: string
          company_tagline: string | null
          company_website: string | null
          created_at: string
          footer_text: string
          hairline_color: string
          header_bg_color: string
          header_text: string
          id: string
          logo_url: string | null
          muted_color: string
          page_bg_color: string
          panel_bg_color: string
          payment_info: string | null
          payment_note: string | null
          sections: Json
          signature_name: string | null
          signature_title: string | null
          text_color: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          brand_color?: string
          company_address?: string | null
          company_email?: string | null
          company_name?: string
          company_tagline?: string | null
          company_website?: string | null
          created_at?: string
          footer_text?: string
          hairline_color?: string
          header_bg_color?: string
          header_text?: string
          id?: string
          logo_url?: string | null
          muted_color?: string
          page_bg_color?: string
          panel_bg_color?: string
          payment_info?: string | null
          payment_note?: string | null
          sections?: Json
          signature_name?: string | null
          signature_title?: string | null
          text_color?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          brand_color?: string
          company_address?: string | null
          company_email?: string | null
          company_name?: string
          company_tagline?: string | null
          company_website?: string | null
          created_at?: string
          footer_text?: string
          hairline_color?: string
          header_bg_color?: string
          header_text?: string
          id?: string
          logo_url?: string | null
          muted_color?: string
          page_bg_color?: string
          panel_bg_color?: string
          payment_info?: string | null
          payment_note?: string | null
          sections?: Json
          signature_name?: string | null
          signature_title?: string | null
          text_color?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      invoice_project_costs: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          id: string
          invoice_id: string
          name: string
          sequence: number
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          invoice_id: string
          name: string
          sequence?: number
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          invoice_id?: string
          name?: string
          sequence?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_project_costs_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_reminder_log: {
        Row: {
          day_bucket: string
          id: string
          installment_id: string
          kind: string
          provider_ref: string | null
          recipients: string[] | null
          sent_at: string
        }
        Insert: {
          day_bucket: string
          id?: string
          installment_id: string
          kind: string
          provider_ref?: string | null
          recipients?: string[] | null
          sent_at?: string
        }
        Update: {
          day_bucket?: string
          id?: string
          installment_id?: string
          kind?: string
          provider_ref?: string | null
          recipients?: string[] | null
          sent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_reminder_log_installment_id_fkey"
            columns: ["installment_id"]
            isOneToOne: false
            referencedRelation: "invoice_installments"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_stakeholders: {
        Row: {
          created_at: string
          id: string
          invoice_id: string
          note: string | null
          percent: number
          role: Database["public"]["Enums"]["stakeholder_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invoice_id: string
          note?: string | null
          percent: number
          role: Database["public"]["Enums"]["stakeholder_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invoice_id?: string
          note?: string | null
          percent?: number
          role?: Database["public"]["Enums"]["stakeholder_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_stakeholders_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          created_at: string
          created_by: string | null
          currency: string
          customer_id: string
          description: string | null
          discount_amount: number
          due_date: string | null
          ends_on: string | null
          id: string
          internal_notes: string | null
          notes: string | null
          paid_amount: number
          project_cost_total: number
          project_id: string | null
          project_type: string
          slug: string | null
          starts_on: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          tax_percent: number
          terms: string | null
          title: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id: string
          description?: string | null
          discount_amount?: number
          due_date?: string | null
          ends_on?: string | null
          id?: string
          internal_notes?: string | null
          notes?: string | null
          paid_amount?: number
          project_cost_total?: number
          project_id?: string | null
          project_type?: string
          slug?: string | null
          starts_on?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          tax_percent?: number
          terms?: string | null
          title: string
          total_amount: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: string
          description?: string | null
          discount_amount?: number
          due_date?: string | null
          ends_on?: string | null
          id?: string
          internal_notes?: string | null
          notes?: string | null
          paid_amount?: number
          project_cost_total?: number
          project_id?: string | null
          project_type?: string
          slug?: string | null
          starts_on?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          tax_percent?: number
          terms?: string | null
          title?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "client_projects"
            referencedColumns: ["id"]
          },
        ]
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
      lead_transfer_requests: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          from_user_id: string | null
          id: string
          lead_id: string
          note: string | null
          requester_id: string
          status: string
          to_user_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          from_user_id?: string | null
          id?: string
          lead_id: string
          note?: string | null
          requester_id: string
          status?: string
          to_user_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          from_user_id?: string | null
          id?: string
          lead_id?: string
          note?: string | null
          requester_id?: string
          status?: string
          to_user_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_transfer_requests_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          alt_email: string | null
          alt_email_label: string | null
          alt_phone: string | null
          alt_phone_label: string | null
          budget: number | null
          company: string | null
          contact_person: string | null
          contact_preference: string | null
          created_at: string
          created_by: string | null
          created_by_code: string | null
          created_by_name: string | null
          currency: string
          email_label: string | null
          id: string
          is_draft: boolean
          last_activity_at: string
          lead_code: string
          name: string
          next_action: string | null
          next_follow_up_at: string | null
          notes: string | null
          owner_id: string | null
          phone: string | null
          phone_label: string | null
          priority: string
          requirement: string | null
          role: string | null
          service: string | null
          service_other: string | null
          sheet_row_id: string | null
          sheet_source: string
          sheet_sync_error: string | null
          sheet_sync_status: string
          sheet_synced_at: string | null
          slug: string
          source: string | null
          source_other: string | null
          status: string
          synced_at: string | null
          timeline: string | null
          updated_at: string
          value_usd: number | null
          whatsapp: string | null
        }
        Insert: {
          alt_email?: string | null
          alt_email_label?: string | null
          alt_phone?: string | null
          alt_phone_label?: string | null
          budget?: number | null
          company?: string | null
          contact_person?: string | null
          contact_preference?: string | null
          created_at?: string
          created_by?: string | null
          created_by_code?: string | null
          created_by_name?: string | null
          currency?: string
          email_label?: string | null
          id?: string
          is_draft?: boolean
          last_activity_at?: string
          lead_code?: string
          name: string
          next_action?: string | null
          next_follow_up_at?: string | null
          notes?: string | null
          owner_id?: string | null
          phone?: string | null
          phone_label?: string | null
          priority?: string
          requirement?: string | null
          role?: string | null
          service?: string | null
          service_other?: string | null
          sheet_row_id?: string | null
          sheet_source?: string
          sheet_sync_error?: string | null
          sheet_sync_status?: string
          sheet_synced_at?: string | null
          slug: string
          source?: string | null
          source_other?: string | null
          status?: string
          synced_at?: string | null
          timeline?: string | null
          updated_at?: string
          value_usd?: number | null
          whatsapp?: string | null
        }
        Update: {
          alt_email?: string | null
          alt_email_label?: string | null
          alt_phone?: string | null
          alt_phone_label?: string | null
          budget?: number | null
          company?: string | null
          contact_person?: string | null
          contact_preference?: string | null
          created_at?: string
          created_by?: string | null
          created_by_code?: string | null
          created_by_name?: string | null
          currency?: string
          email_label?: string | null
          id?: string
          is_draft?: boolean
          last_activity_at?: string
          lead_code?: string
          name?: string
          next_action?: string | null
          next_follow_up_at?: string | null
          notes?: string | null
          owner_id?: string | null
          phone?: string | null
          phone_label?: string | null
          priority?: string
          requirement?: string | null
          role?: string | null
          service?: string | null
          service_other?: string | null
          sheet_row_id?: string | null
          sheet_source?: string
          sheet_sync_error?: string | null
          sheet_sync_status?: string
          sheet_synced_at?: string | null
          slug?: string
          source?: string | null
          source_other?: string | null
          status?: string
          synced_at?: string | null
          timeline?: string | null
          updated_at?: string
          value_usd?: number | null
          whatsapp?: string | null
        }
        Relationships: []
      }
      notification_events: {
        Row: {
          actor_user_id: string | null
          attempt_count: number
          created_at: string
          dedupe_key: string | null
          deferred_until: string | null
          event_key: string
          id: string
          message: string | null
          next_attempt_at: string | null
          payload: Json
          reason: string | null
          recipient_user_id: string
          sent_at: string | null
          status: string
          tg_message_id: number | null
        }
        Insert: {
          actor_user_id?: string | null
          attempt_count?: number
          created_at?: string
          dedupe_key?: string | null
          deferred_until?: string | null
          event_key: string
          id?: string
          message?: string | null
          next_attempt_at?: string | null
          payload?: Json
          reason?: string | null
          recipient_user_id: string
          sent_at?: string | null
          status?: string
          tg_message_id?: number | null
        }
        Update: {
          actor_user_id?: string | null
          attempt_count?: number
          created_at?: string
          dedupe_key?: string | null
          deferred_until?: string | null
          event_key?: string
          id?: string
          message?: string | null
          next_attempt_at?: string | null
          payload?: Json
          reason?: string | null
          recipient_user_id?: string
          sent_at?: string | null
          status?: string
          tg_message_id?: number | null
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          created_at: string
          digest_mode: boolean
          group_finance: boolean
          group_inbox: boolean
          group_leads: boolean
          group_meetings: boolean
          group_security: boolean
          group_system: boolean
          quiet_hours_enabled: boolean
          quiet_hours_end: string
          quiet_hours_start: string
          timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          digest_mode?: boolean
          group_finance?: boolean
          group_inbox?: boolean
          group_leads?: boolean
          group_meetings?: boolean
          group_security?: boolean
          group_system?: boolean
          quiet_hours_enabled?: boolean
          quiet_hours_end?: string
          quiet_hours_start?: string
          timezone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          digest_mode?: boolean
          group_finance?: boolean
          group_inbox?: boolean
          group_leads?: boolean
          group_meetings?: boolean
          group_security?: boolean
          group_system?: boolean
          quiet_hours_enabled?: boolean
          quiet_hours_end?: string
          quiet_hours_start?: string
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_rules: {
        Row: {
          config: Json
          created_at: string
          enabled: boolean
          event_key: string
          role_admin: boolean
          role_employee: boolean
          role_finance: boolean
          role_super_admin: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          config?: Json
          created_at?: string
          enabled?: boolean
          event_key: string
          role_admin?: boolean
          role_employee?: boolean
          role_finance?: boolean
          role_super_admin?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          config?: Json
          created_at?: string
          enabled?: boolean
          event_key?: string
          role_admin?: boolean
          role_employee?: boolean
          role_finance?: boolean
          role_super_admin?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      owner_withdrawals: {
        Row: {
          amount: number
          approved_by: string | null
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          payment_method: string | null
          reason: string
          recipient_name: string
          recipient_user_id: string | null
          transaction_reference: string | null
          withdrawn_on: string
        }
        Insert: {
          amount: number
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          payment_method?: string | null
          reason: string
          recipient_name: string
          recipient_user_id?: string | null
          transaction_reference?: string | null
          withdrawn_on?: string
        }
        Update: {
          amount?: number
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          payment_method?: string | null
          reason?: string
          recipient_name?: string
          recipient_user_id?: string | null
          transaction_reference?: string | null
          withdrawn_on?: string
        }
        Relationships: []
      }
      passkey_challenges: {
        Row: {
          branta_local: string | null
          challenge: string
          created_at: string
          expires_at: string
          id: string
          purpose: string
          user_id: string | null
        }
        Insert: {
          branta_local?: string | null
          challenge: string
          created_at?: string
          expires_at?: string
          id?: string
          purpose: string
          user_id?: string | null
        }
        Update: {
          branta_local?: string | null
          challenge?: string
          created_at?: string
          expires_at?: string
          id?: string
          purpose?: string
          user_id?: string | null
        }
        Relationships: []
      }
      password_history: {
        Row: {
          created_at: string
          id: string
          password_hash: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          password_hash: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          password_hash?: string
          user_id?: string
        }
        Relationships: []
      }
      profile_social_links: {
        Row: {
          created_at: string
          id: string
          label: string | null
          platform: string
          sort_order: number
          updated_at: string
          url: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          label?: string | null
          platform: string
          sort_order?: number
          updated_at?: string
          url: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string | null
          platform?: string
          sort_order?: number
          updated_at?: string
          url?: string
          user_id?: string
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
          employee_code: string | null
          full_name: string | null
          id: string
          identity_doc_type: string | null
          job_role: string | null
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
          must_change_password: boolean
          must_link_telegram: boolean
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
          employee_code?: string | null
          full_name?: string | null
          id?: string
          identity_doc_type?: string | null
          job_role?: string | null
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
          must_change_password?: boolean
          must_link_telegram?: boolean
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
          employee_code?: string | null
          full_name?: string | null
          id?: string
          identity_doc_type?: string | null
          job_role?: string | null
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
          must_change_password?: boolean
          must_link_telegram?: boolean
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
      salary_slips: {
        Row: {
          bank_name: string | null
          base_amount: number
          components: Json
          created_at: string
          created_by: string | null
          currency: string
          expense_id: string | null
          id: string
          net_amount: number
          paid_on: string
          payment_method: string | null
          payout_id: string | null
          period_month: string
          reason: string | null
          signed_slip_at: string | null
          signed_slip_by: string | null
          signed_slip_url: string | null
          slip_no: string | null
          status: string
          txn_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          bank_name?: string | null
          base_amount?: number
          components?: Json
          created_at?: string
          created_by?: string | null
          currency?: string
          expense_id?: string | null
          id?: string
          net_amount?: number
          paid_on?: string
          payment_method?: string | null
          payout_id?: string | null
          period_month: string
          reason?: string | null
          signed_slip_at?: string | null
          signed_slip_by?: string | null
          signed_slip_url?: string | null
          slip_no?: string | null
          status?: string
          txn_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          bank_name?: string | null
          base_amount?: number
          components?: Json
          created_at?: string
          created_by?: string | null
          currency?: string
          expense_id?: string | null
          id?: string
          net_amount?: number
          paid_on?: string
          payment_method?: string | null
          payout_id?: string | null
          period_month?: string
          reason?: string | null
          signed_slip_at?: string | null
          signed_slip_by?: string | null
          signed_slip_url?: string | null
          slip_no?: string | null
          status?: string
          txn_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "salary_slips_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_slips_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "invoice_payouts"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_link_requests: {
        Row: {
          created_at: string
          expires_at: string
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          token: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      telegram_subscriptions: {
        Row: {
          active: boolean
          chat_id: number
          created_at: string
          linked_at: string
          telegram_first_name: string | null
          telegram_username: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          chat_id: number
          created_at?: string
          linked_at?: string
          telegram_first_name?: string | null
          telegram_username?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          chat_id?: number
          created_at?: string
          linked_at?: string
          telegram_first_name?: string | null
          telegram_username?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_passkeys: {
        Row: {
          aaguid: string | null
          backed_up: boolean
          counter: number
          created_at: string
          credential_id: string
          device_type: string | null
          friendly_name: string | null
          id: string
          last_used_at: string | null
          public_key: string
          transports: string[] | null
          user_id: string
        }
        Insert: {
          aaguid?: string | null
          backed_up?: boolean
          counter?: number
          created_at?: string
          credential_id: string
          device_type?: string | null
          friendly_name?: string | null
          id?: string
          last_used_at?: string | null
          public_key: string
          transports?: string[] | null
          user_id: string
        }
        Update: {
          aaguid?: string | null
          backed_up?: boolean
          counter?: number
          created_at?: string
          credential_id?: string
          device_type?: string | null
          friendly_name?: string | null
          id?: string
          last_used_at?: string | null
          public_key?: string
          transports?: string[] | null
          user_id?: string
        }
        Relationships: []
      }
      user_permissions: {
        Row: {
          created_at: string
          customer_access: boolean
          customer_view_all: boolean
          customer_view_detail: boolean
          lead_assign: boolean
          lead_delete: boolean
          lead_manage: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          customer_access?: boolean
          customer_view_all?: boolean
          customer_view_detail?: boolean
          lead_assign?: boolean
          lead_delete?: boolean
          lead_manage?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          customer_access?: boolean
          customer_view_all?: boolean
          customer_view_detail?: boolean
          lead_assign?: boolean
          lead_delete?: boolean
          lead_manage?: boolean
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
      user_sessions: {
        Row: {
          browser: string | null
          city: string | null
          country: string | null
          created_at: string
          device: string | null
          id: string
          ip: string | null
          is_current: boolean
          last_seen_at: string
          os: string | null
          region: string | null
          revoked_at: string | null
          session_key: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          browser?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          device?: string | null
          id?: string
          ip?: string | null
          is_current?: boolean
          last_seen_at?: string
          os?: string | null
          region?: string | null
          revoked_at?: string | null
          session_key: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          browser?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          device?: string | null
          id?: string
          ip?: string | null
          is_current?: boolean
          last_seen_at?: string
          os?: string | null
          region?: string | null
          revoked_at?: string | null
          session_key?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      withdrawal_requests: {
        Row: {
          admin_note: string | null
          amount: number
          created_at: string
          currency: string
          decided_at: string | null
          decided_by: string | null
          id: string
          paid_at: string | null
          paid_by: string | null
          payment_method_id: string | null
          payment_method_snapshot: Json | null
          requested_at: string
          status: Database["public"]["Enums"]["withdrawal_status"]
          transfer_ref: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_note?: string | null
          amount: number
          created_at?: string
          currency?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          paid_at?: string | null
          paid_by?: string | null
          payment_method_id?: string | null
          payment_method_snapshot?: Json | null
          requested_at?: string
          status?: Database["public"]["Enums"]["withdrawal_status"]
          transfer_ref?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_note?: string | null
          amount?: number
          created_at?: string
          currency?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          paid_at?: string | null
          paid_by?: string | null
          payment_method_id?: string | null
          payment_method_snapshot?: Json | null
          requested_at?: string
          status?: Database["public"]["Enums"]["withdrawal_status"]
          transfer_ref?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      fund_balances: {
        Row: {
          allocation_total: number | null
          borrowed: number | null
          code: string | null
          committed: number | null
          display_order: number | null
          fund_id: string | null
          is_active: boolean | null
          kind: string | null
          ledger_balance: number | null
          lent: number | null
          name: string | null
          paid_total: number | null
          spent_total: number | null
          total_credits: number | null
          total_debits: number | null
        }
        Relationships: []
      }
      v_wallet_balances: {
        Row: {
          available: number | null
          currency: string | null
          locked: number | null
          paid_total: number | null
          requested: number | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _fund_guard: {
        Args: { _amount: number; _fund: string }
        Returns: undefined
      }
      allocate_installment: {
        Args: { _actor?: string; _installment_id: string; _source?: string }
        Returns: string
      }
      apply_super_admin_bypass: {
        Args: { _schema: string; _table: string }
        Returns: undefined
      }
      can_manage_task: {
        Args: { _task_id: string; _user: string }
        Returns: boolean
      }
      employee_payment_set_status: {
        Args: {
          _id: string
          _method?: string
          _reason?: string
          _ref?: string
          _status: string
        }
        Returns: undefined
      }
      expense_fund_debit: {
        Args: { _exceptional_reason?: string; _expense: string; _fund: string }
        Returns: undefined
      }
      fund_available: { Args: { _fund_id: string }; Returns: number }
      fund_committed: { Args: { _fund_id: string }; Returns: number }
      fund_loan_cancel: {
        Args: { _loan: string; _reason: string }
        Returns: undefined
      }
      fund_loan_create: {
        Args: {
          _amount: number
          _expense?: string
          _from: string
          _reason: string
          _to: string
        }
        Returns: string
      }
      fund_loan_repay: {
        Args: { _amount: number; _loan: string; _notes?: string }
        Returns: undefined
      }
      fund_transfer: {
        Args: {
          _amount: number
          _expense?: string
          _from: string
          _reason: string
          _to: string
        }
        Returns: string
      }
      generate_employee_code: { Args: never; Returns: string }
      has_permission: {
        Args: { _perm: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_finance_admin: { Args: { _user_id?: string }; Returns: boolean }
      is_lead_owner: { Args: { _lead_id: string }; Returns: boolean }
      is_super_admin: { Args: { _user_id?: string }; Returns: boolean }
      is_task_assignee: {
        Args: { _task_id: string; _user: string }
        Returns: boolean
      }
      owner_withdraw: {
        Args: {
          _amount: number
          _date: string
          _method: string
          _name: string
          _notes: string
          _reason: string
          _ref: string
          _user: string
        }
        Returns: string
      }
      purge_expired_expenses: { Args: never; Returns: number }
      retry_installment_allocation: {
        Args: { _installment_id: string }
        Returns: string
      }
      reverse_installment_allocation: {
        Args: { _allocation_id: string; _reason: string }
        Returns: undefined
      }
      validate_branta_email: { Args: { _email: string }; Returns: boolean }
    }
    Enums: {
      app_role: "super_admin" | "admin" | "manager" | "user" | "finance"
      expense_category:
        | "salary"
        | "tools"
        | "ads"
        | "office"
        | "misc"
        | "tax"
        | "refund"
      installment_status:
        | "pending"
        | "invoiced"
        | "paid"
        | "overdue"
        | "cancelled"
      invoice_email_status:
        | "queued"
        | "sending"
        | "sent"
        | "delivered"
        | "opened"
        | "clicked"
        | "bounced"
        | "complained"
        | "failed"
        | "suppressed"
        | "delivery_delayed"
      invoice_email_trigger:
        | "manual"
        | "auto_created"
        | "auto_installment_paid"
        | "auto_fully_paid"
        | "resend"
        | "reminder"
      invoice_status:
        | "draft"
        | "sent"
        | "partially_paid"
        | "paid"
        | "overdue"
        | "void"
      lead_status:
        | "new"
        | "contacted"
        | "viewed"
        | "meeting"
        | "converted"
        | "lost"
      payout_status: "locked" | "available" | "requested" | "paid" | "cancelled"
      stakeholder_role: "outreach" | "lead_closer" | "worker" | "company"
      withdrawal_status: "pending" | "approved" | "rejected" | "paid"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["super_admin", "admin", "manager", "user", "finance"],
      expense_category: [
        "salary",
        "tools",
        "ads",
        "office",
        "misc",
        "tax",
        "refund",
      ],
      installment_status: [
        "pending",
        "invoiced",
        "paid",
        "overdue",
        "cancelled",
      ],
      invoice_email_status: [
        "queued",
        "sending",
        "sent",
        "delivered",
        "opened",
        "clicked",
        "bounced",
        "complained",
        "failed",
        "suppressed",
        "delivery_delayed",
      ],
      invoice_email_trigger: [
        "manual",
        "auto_created",
        "auto_installment_paid",
        "auto_fully_paid",
        "resend",
        "reminder",
      ],
      invoice_status: [
        "draft",
        "sent",
        "partially_paid",
        "paid",
        "overdue",
        "void",
      ],
      lead_status: [
        "new",
        "contacted",
        "viewed",
        "meeting",
        "converted",
        "lost",
      ],
      payout_status: ["locked", "available", "requested", "paid", "cancelled"],
      stakeholder_role: ["outreach", "lead_closer", "worker", "company"],
      withdrawal_status: ["pending", "approved", "rejected", "paid"],
    },
  },
} as const
