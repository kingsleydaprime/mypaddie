
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "buckets": {
                  Row: {
                    "balance": number,"name": Database["public"]['Enums']["bucket_name"],"target_pct": number | null,"user_id": string
                  }
                  Insert: {
                    "balance"?: number,"name": Database["public"]['Enums']["bucket_name"],"target_pct"?: number | null,"user_id"?: string
                  }
                  Update: {
                    "balance"?: number,"name"?: Database["public"]['Enums']["bucket_name"],"target_pct"?: number | null,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"checkins": {
                  Row: {
                    "created_at": string,"day": string,"energy": number,"id": string,"note": string | null,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"day": string,"energy": number,"id"?: string,"note"?: string | null,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"day"?: string,"energy"?: number,"id"?: string,"note"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"identity_profiles": {
                  Row: {
                    "created_at": string,"id": string,"is_active": boolean,"name": string,"text": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"is_active"?: boolean,"name": string,"text": string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"is_active"?: boolean,"name"?: string,"text"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"items": {
                  Row: {
                    "comfortable_amount": number | null,"created_at": string,"deadline": string | null,"floor_amount": number | null,"id": string,"priority": number,"status": Database["public"]['Enums']["item_status"],"target": string | null,"tier": Database["public"]['Enums']["tier"],"title": string,"user_id": string
                  }
                  Insert: {
                    "comfortable_amount"?: number | null,"created_at"?: string,"deadline"?: string | null,"floor_amount"?: number | null,"id"?: string,"priority"?: number,"status"?: Database["public"]['Enums']["item_status"],"target"?: string | null,"tier": Database["public"]['Enums']["tier"],"title": string,"user_id"?: string
                  }
                  Update: {
                    "comfortable_amount"?: number | null,"created_at"?: string,"deadline"?: string | null,"floor_amount"?: number | null,"id"?: string,"priority"?: number,"status"?: Database["public"]['Enums']["item_status"],"target"?: string | null,"tier"?: Database["public"]['Enums']["tier"],"title"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"memories": {
                  Row: {
                    "at": string,"category": string,"id": string,"source": string | null,"text": string,"user_id": string
                  }
                  Insert: {
                    "at"?: string,"category": string,"id"?: string,"source"?: string | null,"text": string,"user_id"?: string
                  }
                  Update: {
                    "at"?: string,"category"?: string,"id"?: string,"source"?: string | null,"text"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"pillars": {
                  Row: {
                    "hp": number,"level": number,"name": Database["public"]['Enums']["pillar"],"user_id": string,"xp": number
                  }
                  Insert: {
                    "hp"?: number,"level"?: number,"name": Database["public"]['Enums']["pillar"],"user_id"?: string,"xp"?: number
                  }
                  Update: {
                    "hp"?: number,"level"?: number,"name"?: Database["public"]['Enums']["pillar"],"user_id"?: string,"xp"?: number
                  }
                  Relationships: [
                    
                  ]
                },"purchase_checks": {
                  Row: {
                    "decided_at": string,"id": string,"item": string,"price": number,"reasons": NonNullable<Json>,"user_id": string,"verdict": Database["public"]['Enums']["purchase_verdict"]
                  }
                  Insert: {
                    "decided_at"?: string,"id"?: string,"item": string,"price": number,"reasons"?: NonNullable<Json>,"user_id"?: string,"verdict": Database["public"]['Enums']["purchase_verdict"]
                  }
                  Update: {
                    "decided_at"?: string,"id"?: string,"item"?: string,"price"?: number,"reasons"?: NonNullable<Json>,"user_id"?: string,"verdict"?: Database["public"]['Enums']["purchase_verdict"]
                  }
                  Relationships: [
                    
                  ]
                },"push_subscriptions": {
                  Row: {
                    "auth": string,"created_at": string,"endpoint": string,"id": string,"p256dh": string,"user_id": string
                  }
                  Insert: {
                    "auth": string,"created_at"?: string,"endpoint": string,"id"?: string,"p256dh": string,"user_id"?: string
                  }
                  Update: {
                    "auth"?: string,"created_at"?: string,"endpoint"?: string,"id"?: string,"p256dh"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"settings": {
                  Row: {
                    "key": string,"user_id": string,"value": NonNullable<Json>
                  }
                  Insert: {
                    "key": string,"user_id"?: string,"value": NonNullable<Json>
                  }
                  Update: {
                    "key"?: string,"user_id"?: string,"value"?: NonNullable<Json>
                  }
                  Relationships: [
                    
                  ]
                },"slips": {
                  Row: {
                    "accepted": boolean,"at": string,"id": string,"task_id": string,"tone_used": Database["public"]['Enums']["mode"] | null,"user_id": string,"why": string | null,"why_category": string | null
                  }
                  Insert: {
                    "accepted": boolean,"at"?: string,"id"?: string,"task_id": string,"tone_used"?: Database["public"]['Enums']["mode"] | null,"user_id"?: string,"why"?: string | null,"why_category"?: string | null
                  }
                  Update: {
                    "accepted"?: boolean,"at"?: string,"id"?: string,"task_id"?: string,"tone_used"?: Database["public"]['Enums']["mode"] | null,"user_id"?: string,"why"?: string | null,"why_category"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "slips_task_id_user_id_fkey"
      columns: ["task_id","user_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"task_pillars": {
                  Row: {
                    "pillar": Database["public"]['Enums']["pillar"],"task_id": string,"user_id": string,"weight": number
                  }
                  Insert: {
                    "pillar": Database["public"]['Enums']["pillar"],"task_id": string,"user_id"?: string,"weight": number
                  }
                  Update: {
                    "pillar"?: Database["public"]['Enums']["pillar"],"task_id"?: string,"user_id"?: string,"weight"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "task_pillars_task_id_user_id_fkey"
      columns: ["task_id","user_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"tasks": {
                  Row: {
                    "base_xp": number,"created_at": string,"done_at": string | null,"due_at": string | null,"duration_minutes": number | null,"id": string,"is_non_negotiable": boolean,"item_id": string | null,"must_from": string | null,"occurs_on": string | null,"recurrence": string | null,"reminders": (string)[] | null,"series_id": string | null,"status": Database["public"]['Enums']["task_status"],"title": string,"user_id": string
                  }
                  Insert: {
                    "base_xp"?: number,"created_at"?: string,"done_at"?: string | null,"due_at"?: string | null,"duration_minutes"?: number | null,"id"?: string,"is_non_negotiable"?: boolean,"item_id"?: string | null,"must_from"?: string | null,"occurs_on"?: string | null,"recurrence"?: string | null,"reminders"?: (string)[] | null,"series_id"?: string | null,"status"?: Database["public"]['Enums']["task_status"],"title": string,"user_id"?: string
                  }
                  Update: {
                    "base_xp"?: number,"created_at"?: string,"done_at"?: string | null,"due_at"?: string | null,"duration_minutes"?: number | null,"id"?: string,"is_non_negotiable"?: boolean,"item_id"?: string | null,"must_from"?: string | null,"occurs_on"?: string | null,"recurrence"?: string | null,"reminders"?: (string)[] | null,"series_id"?: string | null,"status"?: Database["public"]['Enums']["task_status"],"title"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tasks_item_id_user_id_fkey"
      columns: ["item_id","user_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"transactions": {
                  Row: {
                    "amount": number,"at": string,"category": string,"direction": Database["public"]['Enums']["money_direction"],"id": string,"item_id": string | null,"note": string | null,"spend_level": Database["public"]['Enums']["spend_level"] | null,"split_applied_at": string | null,"tag": Database["public"]['Enums']["money_tag"] | null,"user_id": string
                  }
                  Insert: {
                    "amount": number,"at"?: string,"category": string,"direction": Database["public"]['Enums']["money_direction"],"id"?: string,"item_id"?: string | null,"note"?: string | null,"spend_level"?: Database["public"]['Enums']["spend_level"] | null,"split_applied_at"?: string | null,"tag"?: Database["public"]['Enums']["money_tag"] | null,"user_id"?: string
                  }
                  Update: {
                    "amount"?: number,"at"?: string,"category"?: string,"direction"?: Database["public"]['Enums']["money_direction"],"id"?: string,"item_id"?: string | null,"note"?: string | null,"spend_level"?: Database["public"]['Enums']["spend_level"] | null,"split_applied_at"?: string | null,"tag"?: Database["public"]['Enums']["money_tag"] | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "transactions_item_id_user_id_fkey"
      columns: ["item_id","user_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"xp_log": {
                  Row: {
                    "amount": number,"at": string,"id": string,"item_id": string | null,"note": string | null,"pillar": Database["public"]['Enums']["pillar"],"reason": Database["public"]['Enums']["xp_reason"],"task_id": string | null,"user_id": string
                  }
                  Insert: {
                    "amount": number,"at"?: string,"id"?: string,"item_id"?: string | null,"note"?: string | null,"pillar": Database["public"]['Enums']["pillar"],"reason": Database["public"]['Enums']["xp_reason"],"task_id"?: string | null,"user_id"?: string
                  }
                  Update: {
                    "amount"?: number,"at"?: string,"id"?: string,"item_id"?: string | null,"note"?: string | null,"pillar"?: Database["public"]['Enums']["pillar"],"reason"?: Database["public"]['Enums']["xp_reason"],"task_id"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "xp_log_item_id_user_id_fkey"
      columns: ["item_id","user_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "xp_log_task_id_user_id_fkey"
      columns: ["task_id","user_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id","user_id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "activate_identity":
{ Args: { "p_id": string }; Returns: boolean
                           },
"apply_split":
{ Args: { "p_amounts": Json,"p_transaction_id": string }; Returns: string
                           },
"award_xp":
{ Args: { "p_entries": Json }; Returns: number
                           },
"complete_task":
{ Args: { "p_done_at": string,"p_entries": Json,"p_task_id": string }; Returns: Json
                           },
"export_all":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"record_slip":
{ Args: { "p_accepted": boolean,"p_task_id": string,"p_tone": Database["public"]['Enums']["mode"],"p_why": string,"p_why_category": string }; Returns: string
                           },
"record_transaction":
{ Args: { "p_amount": number,"p_at": string,"p_category": string,"p_direction": Database["public"]['Enums']["money_direction"],"p_item_id": string,"p_note": string,"p_spend_level": Database["public"]['Enums']["spend_level"],"p_tag": Database["public"]['Enums']["money_tag"],"p_xp": Json }; Returns: string
                           },
"save_identity":
{ Args: { "p_activate": boolean,"p_name": string,"p_text": string }; Returns: string
                           },
"set_task_weights":
{ Args: { "p_task_id": string,"p_weights": Json }; Returns: undefined
                           },
"spawn_occurrence":
{ Args: { "p_due_at": string,"p_occurs_on": string,"p_series_id": string }; Returns: string
                           }
          }
          Enums: {
            "bucket_name": "needs"|"buffer"|"savings"|"wants"|"flexible","item_status": "active"|"done"|"paused"|"dropped","mode": "curious"|"strict"|"soft"|"strictest"|"softest","money_direction": "in"|"out","money_tag": "need"|"want"|"unsure","pillar": "spiritual"|"mental"|"physical"|"financial"|"emotional"|"social"|"character"|"skills"|"creativity"|"relationships"|"academic","purchase_verdict": "yes"|"wait_24h"|"no","spend_level": "floor"|"comfortable","task_status": "pending"|"done"|"skipped"|"cancelled","tier": "need"|"want"|"goal"|"wish"|"dream","xp_reason": "completion"|"late_completion"|"ignored_need"|"goal_completion"|"wish_fulfilled"|"dream_milestone"|"transaction_logged"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "bucket_name": ["needs", "buffer", "savings", "wants", "flexible"],"item_status": ["active", "done", "paused", "dropped"],"mode": ["curious", "strict", "soft", "strictest", "softest"],"money_direction": ["in", "out"],"money_tag": ["need", "want", "unsure"],"pillar": ["spiritual", "mental", "physical", "financial", "emotional", "social", "character", "skills", "creativity", "relationships", "academic"],"purchase_verdict": ["yes", "wait_24h", "no"],"spend_level": ["floor", "comfortable"],"task_status": ["pending", "done", "skipped", "cancelled"],"tier": ["need", "want", "goal", "wish", "dream"],"xp_reason": ["completion", "late_completion", "ignored_need", "goal_completion", "wish_fulfilled", "dream_milestone", "transaction_logged"]
          }
        }
} as const
