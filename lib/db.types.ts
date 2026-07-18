export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      markets: {
        Row: {
          asking_tc: number
          author_id: string | null
          bullets: string[]
          created_at: string
          expires_at: string
          id: string
          is_real: boolean
          prob_yes_bps: number
          status: string
          title: string
        }
        Insert: {
          asking_tc?: number
          author_id?: string | null
          bullets?: string[]
          created_at?: string
          expires_at: string
          id?: string
          is_real: boolean
          prob_yes_bps?: number
          status?: string
          title: string
        }
        Update: {
          asking_tc?: number
          author_id?: string | null
          bullets?: string[]
          created_at?: string
          expires_at?: string
          id?: string
          is_real?: boolean
          prob_yes_bps?: number
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "markets_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          cash: number
          created_at: string
          handle: string
          id: string
          is_bot: boolean
          ref_code: string
        }
        Insert: {
          cash?: number
          created_at?: string
          handle: string
          id: string
          is_bot?: boolean
          ref_code?: string
        }
        Update: {
          cash?: number
          created_at?: string
          handle?: string
          id?: string
          is_bot?: boolean
          ref_code?: string
        }
        Relationships: []
      }
      positions: {
        Row: {
          market_id: string
          no: number
          player_id: string
          yes: number
        }
        Insert: {
          market_id: string
          no?: number
          player_id: string
          yes?: number
        }
        Update: {
          market_id?: string
          no?: number
          player_id?: string
          yes?: number
        }
        Relationships: [
          {
            foreignKeyName: "positions_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "positions_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "positions_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      referrals: {
        Row: {
          claimed: boolean
          code: string
          id: number
          referee_id: string
          referrer_id: string
          ts: string
        }
        Insert: {
          claimed?: boolean
          code: string
          id?: never
          referee_id: string
          referrer_id: string
          ts?: string
        }
        Update: {
          claimed?: boolean
          code?: string
          id?: never
          referee_id?: string
          referrer_id?: string
          ts?: string
        }
        Relationships: [
          {
            foreignKeyName: "referrals_referee_id_fkey"
            columns: ["referee_id"]
            isOneToOne: true
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      trades: {
        Row: {
          action: string
          id: number
          market_id: string
          player_id: string
          price_cents: number
          shares: number
          side: string
          ts: string
        }
        Insert: {
          action: string
          id?: never
          market_id: string
          player_id: string
          price_cents: number
          shares: number
          side: string
          ts?: string
        }
        Update: {
          action?: string
          id?: never
          market_id?: string
          player_id?: string
          price_cents?: number
          shares?: number
          side?: string
          ts?: string
        }
        Relationships: [
          {
            foreignKeyName: "trades_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trades_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trades_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      markets_public: {
        Row: {
          asking_tc: number | null
          author_id: string | null
          bullets: string[] | null
          created_at: string | null
          expires_at: string | null
          id: string | null
          is_real: boolean | null
          prob_yes_bps: number | null
          status: string | null
          title: string | null
        }
        Insert: {
          asking_tc?: number | null
          author_id?: string | null
          bullets?: string[] | null
          created_at?: string | null
          expires_at?: string | null
          id?: string | null
          is_real?: never
          prob_yes_bps?: number | null
          status?: string | null
          title?: string | null
        }
        Update: {
          asking_tc?: number | null
          author_id?: string | null
          bullets?: string[] | null
          created_at?: string | null
          expires_at?: string | null
          id?: string | null
          is_real?: never
          prob_yes_bps?: number | null
          status?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "markets_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      bot_tick: { Args: never; Returns: Json }
      bps_ceil: { Args: never; Returns: number }
      bps_floor: { Args: never; Returns: number }
      claim_referral: {
        Args: { p_code: string; p_new_player: string }
        Returns: Json
      }
      create_market: {
        Args: {
          p_asking_tc: number
          p_bullets: string[]
          p_is_real: boolean
          p_player: string
          p_title: string
        }
        Returns: string
      }
      ensure_player: { Args: { p_handle: string; p_id: string }; Returns: Json }
      game_depth: { Args: never; Returns: number }
      gen_ref_code: { Args: never; Returns: string }
      market_ttl: { Args: never; Returns: string }
      reset_game: { Args: never; Returns: undefined }
      resolve_expired: { Args: never; Returns: number }
      seed_game: { Args: never; Returns: undefined }
      trade: {
        Args: {
          p_action: string
          p_market: string
          p_player: string
          p_shares: number
          p_side: string
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

