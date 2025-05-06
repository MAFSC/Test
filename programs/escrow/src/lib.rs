use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("AZA8raHKHgdSux6WfXakE64KR3DbFxSczkS8NeaPU8zL");

#[program]
pub mod escrow {
    use super::*;

    /// Инициализирует эскроу-аккаунты (токены и USDC)
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        Ok(())
    }

    /// Заёмщик кладёт свои только что minted токены в эскроу
    pub fn deposit_tokens(ctx: Context<DepositTokens>, amount: u64) -> Result<()> {
        token::transfer(ctx.accounts.into_transfer_context(), amount)?;
        Ok(())
    }

    /// Инвестор покупает: USDC → borrower_usdc, токены → investor
    pub fn purchase(
        ctx: Context<Purchase>,
        token_amount: u64,
        usdc_amount: u64
    ) -> Result<()> {
        // 1) инвестор → borrower USDC
        token::transfer(
            ctx.accounts.into_transfer_usdc_context(),
            usdc_amount
        )?;
        // 2) эскроу → инвестор токены (с PDA-сигнатурой)
        token::transfer(
            ctx.accounts.into_transfer_token_context().with_signer(&[&ctx.bumps["escrow_program"]]),
            token_amount
        )?;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
      init_if_needed,
      seeds = [b"escrow", program.key().as_ref()],
      bump,
      payer = payer,
      token::mint = mint,
      token::authority = program,
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,

    #[account(
      init_if_needed,
      seeds = [b"escrow_usdc", program.key().as_ref()],
      bump,
      payer = payer,
      token::mint = usdc_mint,
      token::authority = program,
    )]
    pub escrow_usdc_account: Account<'info, TokenAccount>,

    pub mint:      Account<'info, Mint>,
    pub usdc_mint: Account<'info, Mint>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub token_program:  Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent:          Sysvar<'info, Rent>,

    /// PDA authority
    #[account(seeds=[b"escrow", program.key().as_ref()], bump)]
    pub escrow_program: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct DepositTokens<'info> {
    #[account(mut)]
    pub borrower: Signer<'info>,

    #[account(
      mut,
      associated_token::mint = mint,
      associated_token::authority = borrower
    )]
    pub borrower_token_account: Account<'info, TokenAccount>,

    #[account(
      mut,
      seeds = [b"escrow", program.key().as_ref()],
      bump
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,

    pub mint:          Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Purchase<'info> {
    #[account(mut)]
    pub investor: Signer<'info>,

    #[account(
      mut,
      associated_token::mint = mint,
      associated_token::authority = investor
    )]
    pub investor_token_account: Account<'info, TokenAccount>,

    #[account(
      mut,
      seeds = [b"escrow", program.key().as_ref()],
      bump
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,

    #[account(
      mut,
      associated_token::mint = usdc_mint,
      associated_token::authority = investor
    )]
    pub investor_usdc_account: Account<'info, TokenAccount>,

    #[account(
      mut,
      associated_token::mint = usdc_mint,
      associated_token::authority = borrower
    )]
    pub borrower_usdc_account: Account<'info, TokenAccount>,

    /// Заёмщик (чужой) – просто ключ
    pub borrower: UncheckedAccount<'info>,

    pub mint:         Account<'info, Mint>,
    pub usdc_mint:    Account<'info, Mint>,
    pub token_program: Program<'info, Token>,

    /// PDA authority
    #[account(seeds=[b"escrow", program.key().as_ref()], bump)]
    pub escrow_program: UncheckedAccount<'info>,
}

// вспомогательные функции для CPI
impl<'info> DepositTokens<'info> {
    fn into_transfer_context(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        CpiContext::new(
            self.token_program.to_account_info(),
            Transfer {
                from:      self.borrower_token_account.to_account_info(),
                to:        self.escrow_token_account.to_account_info(),
                authority: self.borrower.to_account_info(),
            },
        )
    }
}

impl<'info> Purchase<'info> {
    fn into_transfer_usdc_context(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        CpiContext::new(
            self.token_program.to_account_info(),
            Transfer {
                from:      self.investor_usdc_account.to_account_info(),
                to:        self.borrower_usdc_account.to_account_info(),
                authority: self.investor.to_account_info(),
            },
        )
    }

    fn into_transfer_token_context(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        CpiContext::new(
            self.token_program.to_account_info(),
            Transfer {
                from:      self.escrow_token_account.to_account_info(),
                to:        self.investor_token_account.to_account_info(),
                authority: self.escrow_program.to_account_info(),
            },
        )
    }
}
