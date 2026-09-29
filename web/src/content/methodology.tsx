import type { ReactNode } from "react";

/**
 * Methodology content. One entry per model: what it does, why it is used,
 * inputs, assumptions, how to read it, limitations and failure modes. Written
 * as plain statements so each can be quoted on its own.
 */

export type ValidationKind =
  | "performance"
  | "var"
  | "garch"
  | "simulation"
  | "regimes"
  | "factors"
  | "stress"
  | "options-bs"
  | "options-mc"
  | "options-binomial"
  | "options-iv"
  | "tx-data"
  | "tx-model"
  | "tx-eval"
  | "tx-limits"
  | null;

/** Which project a model belongs to: the portfolio engine, the options pricer or the transaction categorizer. */
export type MethodGroup = "portfolio" | "options" | "transactions";

export type Method = {
  slug: string;
  /** Defaults to "portfolio". */
  group?: MethodGroup;
  title: string;
  short: string;
  summary: string;
  what: ReactNode;
  why: ReactNode;
  inputs: ReactNode[];
  formula?: string;
  assumptions: ReactNode[];
  reading: ReactNode;
  limitations: ReactNode[];
  failures: ReactNode[];
  changes?: ReactNode[];
  validation: ValidationKind;
  validationIntro?: ReactNode;
  references: string[];
};

export const METHODS: Method[] = [
  {
    slug: "data",
    title: "Data and portfolio construction",
    short: "Data",
    summary: "Where the prices and factors come from, how portfolios are built, and what that leaves out.",
    what: (
      <p>
        Every analysis starts from a snapshot of adjusted daily closing prices for current S&amp;P 500 members and
        about 45 widely held ETFs, from January 2000 onward, plus the daily Fama-French research factors. A job
        rebuilds the snapshot every weeknight after the US close. Page requests never call a market data service.
      </p>
    ),
    why: (
      <p>
        A fixed nightly snapshot makes every result reproducible for a given date, keeps the site fast, and means
        the numbers on the page can be traced to one dataset.
      </p>
    ),
    inputs: [
      "Adjusted closes from Yahoo Finance: dividends and splits are reinvested, so price changes are total returns.",
      "S&P 500 membership from the open datasets/s-and-p-500-companies list.",
      "Fama-French five factors, momentum and the one-month T-bill rate (the risk-free rate) from Kenneth French's data library.",
      "A portfolio of up to 25 tickers with relative weights, carried in the page address and never stored.",
    ],
    formula: "r_p,t = Σ_i w_i · r_i,t        (weights reset to target every day)",
    assumptions: [
      "The portfolio is rebalanced to its target weights every day. Real portfolios drift between rebalances and pay costs to rebalance.",
      "Returns are simple daily returns of adjusted closes. Taxes, fees and trading costs are ignored.",
      "The analysis window starts when every holding has prices. If one holding listed recently, the whole window shortens and the page says which one.",
      "Gaps of up to five trading days (halts, exchange holidays) are filled with the last price and counted in the data notes.",
    ],
    reading: (
      <p>
        Each section shows its date range and, if a holding cut the history short, names it. A shorter window means
        fewer market conditions in the sample, so every estimate built on it is less reliable.
      </p>
    ),
    limitations: [
      <>
        <b>Survivorship bias.</b> The stock universe is today&apos;s S&amp;P 500. Companies that failed or were
        removed since 2000 are missing, so the historical returns of the universe as a whole look better than they
        were. It matters less for a hand-picked portfolio of current names, but the history of those names is still
        the history of winners.
      </>,
      "Stocks outside the S&P 500 and most funds are not available.",
      "The French factors are published with a lag of a month or two, so factor results end earlier than prices.",
    ],
    failures: [
      "A corporate action that the price source handles incorrectly shows up as a false one-day jump.",
      "If the nightly job fails, the site keeps serving the previous day's snapshot; the 'as of' date on each page shows which data is in use.",
    ],
    validation: null,
    references: [
      "Kenneth R. French, Data Library, mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library.html",
      "Brown, S., Goetzmann, W., Ibbotson, R. and Ross, S. (1992). Survivorship bias in performance studies. Review of Financial Studies 5(4).",
    ],
  },
  {
    slug: "performance",
    title: "Performance and risk metrics",
    short: "Performance",
    summary: "Annual return, volatility, Sharpe and Sortino ratios, drawdowns, beta and risk contributions, with bootstrap ranges.",
    what: (
      <p>
        The Overview summarizes the portfolio&apos;s history in a few standard figures and shows how much each
        figure depends on the particular days in the sample.
      </p>
    ),
    why: (
      <p>
        These are the figures most people use to compare portfolios. Showing a range next to each one makes the
        point that a ten-year history is one sample of what markets could have done, and a different decade would
        have produced different numbers.
      </p>
    ),
    inputs: ["Daily portfolio returns over the chosen window (ten years by default).", "Daily risk-free rate from the French library.", "Daily S&P 500 (SPY) returns for beta."],
    formula: `CAGR        = (Π (1 + r_t))^(252 / T) − 1
Volatility  = stdev(r_t) · √252
Sharpe      = mean(r_t − rf_t) / stdev(r_t − rf_t) · √252
Sortino     = mean(r_t − rf_t) / √mean(min(r_t − rf_t, 0)²) · √252
Beta        = cov(r_p, r_m) / var(r_m)
Risk share  = w_i (Σw)_i / (wᵀΣw)`,
    assumptions: [
      "252 trading days a year.",
      "Up-market and down-market betas are separate regressions on days when SPY rose and fell.",
      "Ranges are 90% intervals from a circular block bootstrap: the daily returns are resampled in 21-day blocks 1,000 times and each figure recomputed.",
    ],
    reading: (
      <p>
        Read a range as &quot;with a different draw of days of the same character, this figure could plausibly have
        been anywhere in here.&quot; A Sharpe ratio range that spans zero means the history cannot tell this
        portfolio&apos;s risk-adjusted return apart from cash.
      </p>
    ),
    limitations: [
      "Bootstrap ranges only reshuffle the days in the sample. They cannot show regimes the sample never saw.",
      "Maximum drawdown depends heavily on whether a crash is inside the window.",
      "Risk shares use the sample covariance matrix, which is noisy for many holdings over short windows.",
    ],
    failures: ["With fewer than about two years of data, the ranges become very wide and the point figures are close to meaningless."],
    changes: [
      "Annual return is now compounded (CAGR) rather than the average day compounded 252 times, which overstates growth when returns vary.",
      "Sharpe and Sortino use the daily T-bill rate instead of a fixed 4%.",
      "Sortino uses downside deviation over all days, the standard definition.",
      "Up and down betas are regression slopes rather than ratios of average returns.",
    ],
    validation: "performance",
    validationIntro: "Point estimates and 90% bootstrap ranges for the three example portfolios, from the current snapshot.",
    references: [
      "Sharpe, W. F. (1994). The Sharpe ratio. Journal of Portfolio Management 21(1).",
      "Sortino, F. and Price, L. (1994). Performance measurement in a downside risk framework. Journal of Investing 3(3).",
      "Lo, A. W. (2002). The statistics of Sharpe ratios. Financial Analysts Journal 58(4).",
      "Politis, D. and Romano, J. (1994). The stationary bootstrap. JASA 89(428).",
    ],
  },
  {
    slug: "value-at-risk",
    title: "Value at Risk and backtesting",
    short: "Value at Risk",
    summary: "One-day VaR and expected shortfall by three methods, and an out-of-sample test of whether they held up.",
    what: (
      <p>
        Value at Risk (VaR) at 95% is the one-day loss that is exceeded on only 5% of days. Expected shortfall (ES)
        is the average loss on those 5% of days. The Risk section estimates both three ways and then checks each
        method against what actually happened.
      </p>
    ),
    why: (
      <p>
        VaR is the most widely used single number for short-term downside risk, and also one of the most criticized.
        Showing three methods side by side, with a backtest, turns it from a single confident figure into a
        comparison of assumptions.
      </p>
    ),
    inputs: ["Daily portfolio returns (ten years by default).", "For filtered historical simulation, a GARCH(1,1) fit to those returns."],
    formula: `Historical:           VaR = −quantile(r, 1 − c)
Parametric (normal):  VaR = −σ · Φ⁻¹(1 − c)            ES = σ · φ(Φ⁻¹(1 − c)) / (1 − c)
Filtered historical:  z_t = (r_t − μ) / σ_t              VaR = −(μ + σ_T+1 · quantile(z, 1 − c))
Kupiec LR   = −2 ln[(1−p)^(T−x) p^x] + 2 ln[(1−x/T)^(T−x) (x/T)^x]      ~ χ²(1)`,
    assumptions: [
      "Historical simulation assumes the past window's distribution of daily returns applies tomorrow, with every day weighted equally.",
      "The parametric method assumes normally distributed returns with zero mean.",
      "Filtered historical simulation assumes the GARCH model captures how volatility changes, and that the standardized residuals are drawn from a stable distribution whose shape the history reveals.",
      "Holdings are held for one day at their current weights.",
    ],
    reading: (
      <p>
        The headline uses filtered historical simulation because it reacts to current volatility while keeping the
        fat tails of real returns. When the three methods disagree, that disagreement is informative: a high
        parametric figure relative to historical usually means recent volatility is high; a high historical figure
        relative to parametric usually means fat tails. In the backtest, a 95% VaR should be breached on about 5%
        of days, and breaches should not arrive in clusters.
      </p>
    ),
    limitations: [
      "VaR says nothing about how large losses are beyond the threshold. Expected shortfall is shown for that reason.",
      "One-day figures do not scale simply to longer horizons when volatility clusters.",
      "The backtest covers about three years, so it contains roughly 38 expected breaches at 95% and fewer than 8 at 99%: enough to catch badly wrong models, not subtle ones.",
    ],
    failures: [
      "All three methods fail when tomorrow is worse than anything in the estimation window. In February 2020, a VaR estimated on the calm prior year was badly exceeded.",
      "The parametric method understates tail losses for assets with fat tails or skew.",
      "Historical simulation is slow to react: a volatile period enters and leaves the window abruptly.",
    ],
    changes: [
      "The original version's third method drew random numbers from a normal distribution with the sample mean and volatility, which reproduced the parametric result with simulation noise. It is replaced by filtered historical simulation.",
      "The backtest (Kupiec and Christoffersen tests) is new.",
    ],
    validation: "var",
    validationIntro: "Out-of-sample 95% VaR backtests for the example portfolios over the last three years of the current snapshot. Each forecast uses only data available before that day; GARCH is refitted every 21 trading days on a trailing 1,000-day window.",
    references: [
      "Jorion, P. (2007). Value at Risk, 3rd ed. McGraw-Hill.",
      "Barone-Adesi, G., Giannopoulos, K. and Vosper, L. (1999). VaR without correlations for portfolios of derivative securities. Journal of Futures Markets 19(5).",
      "Kupiec, P. (1995). Techniques for verifying the accuracy of risk measurement models. Journal of Derivatives 3(2).",
      "Christoffersen, P. (1998). Evaluating interval forecasts. International Economic Review 39(4).",
      "Artzner, P., Delbaen, F., Eber, J.-M. and Heath, D. (1999). Coherent measures of risk. Mathematical Finance 9(3).",
    ],
  },
  {
    slug: "garch",
    title: "GARCH(1,1) volatility forecasting",
    short: "GARCH volatility",
    summary: "How volatile the portfolio is now, where the model expects volatility to go, and whether the model fits.",
    what: (
      <p>
        GARCH(1,1) estimates today&apos;s volatility from yesterday&apos;s volatility and yesterday&apos;s
        surprise, then projects it forward. Volatility forecasts drift back toward a long-run level at a speed the
        model estimates from the data.
      </p>
    ),
    why: (
      <p>
        Market volatility clusters: turbulent days follow turbulent days. A single long-run volatility figure
        ignores that. GARCH is the standard, well-understood model of it and needs only the return history.
      </p>
    ),
    inputs: ["Daily portfolio returns (ten years by default); each holding is also fitted on its own."],
    formula: `σ²_t   = ω + α · ε²_t−1 + β · σ²_t−1
σ²_T+k = V_L + (α + β)^(k−1) · (σ²_T+1 − V_L),      V_L = ω / (1 − α − β)
k-day average volatility = √( mean(σ²_T+1 … σ²_T+k) · 252 )`,
    assumptions: [
      "Returns are fitted with a constant mean and normal quasi-likelihood. The normality is only used for estimation; the fitted parameters stay valid under fat tails.",
      "Positive and negative shocks raise volatility equally. In practice, falls raise it more (the leverage effect), which this model does not capture.",
      "Parameters are constant over the estimation window.",
    ],
    reading: (
      <p>
        The 21-day forecast is the average volatility expected over the next 21 trading days, which is the right
        input for anything that spans the whole period. The forecast for day 21 alone would overstate it when
        volatility is falling and understate it when rising. Persistence (α + β) close to 1 means shocks fade
        slowly; the half-life is how long it takes for half of a shock to fade.
      </p>
    ),
    limitations: [
      "The model reacts only after returns move. It does not anticipate scheduled events or news.",
      "With persistence near 1, long-horizon forecasts depend heavily on a long-run level that is itself uncertain.",
    ],
    failures: [
      <>
        If the optimizer returns a degenerate fit (α near 0 with β near 1), fails to converge, or implies
        non-stationary volatility, the engine falls back to an exponentially weighted average with λ = 0.94
        (RiskMetrics) and says so. That fallback&apos;s forecast is flat.
      </>,
      "A Ljung-Box test on squared standardized residuals with a p-value below 0.05 means volatility clustering remains that the model did not capture.",
    ],
    changes: [
      "The original version reported the day-21 forecast as the '21-day forecast'. It is now the average over the 21 days, and both are shown.",
      "Residual diagnostics (Ljung-Box) are new.",
      "The fallback forecast is now flat, as EWMA implies, rather than blended toward a long-run level.",
    ],
    validation: "garch",
    validationIntro: "Fitted parameters and residual diagnostics for the example portfolios from the current snapshot.",
    references: [
      "Engle, R. (1982). Autoregressive conditional heteroscedasticity. Econometrica 50(4).",
      "Bollerslev, T. (1986). Generalized autoregressive conditional heteroskedasticity. Journal of Econometrics 31(3).",
      "J.P. Morgan/Reuters (1996). RiskMetrics Technical Document, 4th ed.",
      "Ljung, G. and Box, G. (1978). On a measure of lack of fit in time series models. Biometrika 65(2).",
    ],
  },
  {
    slug: "monte-carlo",
    title: "Block-bootstrap Monte Carlo",
    short: "Monte Carlo",
    summary: "Thousands of simulated futures built from stretches of real history, and what they can and cannot tell you.",
    what: (
      <p>
        Each simulated path strings together randomly chosen runs of consecutive historical days (21 by default)
        until it reaches the horizon. With 5,000 paths, the spread of ending values shows the range of outcomes the
        portfolio&apos;s own history supports.
      </p>
    ),
    why: (
      <p>
        Resampling real days keeps the fat tails and the co-movement between holdings that a normal-distribution
        simulation loses. Resampling runs of days, rather than single days, also keeps volatility clustering, so
        simulated crashes last as long as real ones did.
      </p>
    ),
    inputs: ["Daily portfolio returns (fifteen years by default).", "Horizon, expected-return mode and block length, all adjustable."],
    formula: `path value_k = 10,000 · Π_{t ≤ k} (1 + r*_t),   r* drawn in blocks of L consecutive historical days
zero mode:     r*_t drawn from (r_t − mean(r))`,
    assumptions: [
      "The future looks like the sample: only days that occurred can occur again, in new orders.",
      "Blocks wrap around the end of the sample (circular bootstrap).",
      "The 'historical' mode uses the sample's average return. The 'zero' mode removes it, because average returns are the least reliably estimated input and dominate long horizons.",
      "Daily rebalancing; no fees, taxes, contributions or withdrawals.",
    ],
    reading: (
      <p>
        The shaded bands contain the middle 50% and 90% of paths. The median path is not a forecast. Switching to
        zero expected return shows how much of the picture comes from the assumed return rather than from risk. The
        ± figures next to probabilities are simulation error from the finite number of paths, not uncertainty about
        markets.
      </p>
    ),
    limitations: [
      "No loss worse than the worst stretch in the sample is possible.",
      "A fifteen-year sample includes one or two severe crises; the simulated frequency of crises inherits that.",
      "Block length is a judgment call: longer blocks keep more dependence but produce less varied paths.",
    ],
    failures: [
      "If the sample is dominated by one strong trend, the historical mode projects that trend forward. The zero mode exists to expose this.",
    ],
    changes: [
      "The original version resampled single days, which destroys volatility clustering. It now resamples 21-day blocks by default.",
      "The zero-return toggle, longer lookback and printed assumptions are new.",
    ],
    validation: "simulation",
    validationIntro: "How the block length changes the simulated spread for the Balanced example (one-year horizon).",
    references: [
      "Künsch, H. (1989). The jackknife and the bootstrap for general stationary observations. Annals of Statistics 17(3).",
      "Politis, D. and Romano, J. (1992). A circular block-resampling procedure for stationary data. In Exploring the Limits of Bootstrap, Wiley.",
      "Efron, B. and Tibshirani, R. (1993). An Introduction to the Bootstrap. Chapman & Hall.",
    ],
  },
  {
    slug: "regimes",
    title: "Hidden Markov model regimes",
    short: "Market regimes",
    summary: "A four-state model of the S&P 500 that labels each period calm, normal, volatile or crisis, using only data available at the time.",
    what: (
      <p>
        A hidden Markov model assumes the market moves between a few unobserved states, each with its own typical
        returns and volatility, and switches between them with fixed probabilities. The model is fitted to three
        features of the S&amp;P 500: its 20-day average return, 20-day volatility and 60-day average return.
      </p>
    ),
    why: (
      <p>
        Risk figures averaged over all market conditions hide how differently a portfolio behaves in calm and
        turbulent periods. Regimes give a data-driven way to split history and ask how this portfolio did in each.
      </p>
    ),
    inputs: ["Daily SPY returns since 2000.", "The portfolio's daily returns, only for the per-regime performance table."],
    formula: `filtered probability:  P(s_t | x_1 … x_t) ∝ p(x_t | s_t) · Σ_j P(s_t | s_t−1 = j) · P(s_t−1 = j | x_1 … x_t−1)
confidence shown:      min(p_max, 0.95), excess spread across the other states in proportion`,
    assumptions: [
      "Four states, each a multivariate normal distribution of the three features.",
      "Constant transition probabilities.",
      "Model parameters are estimated once on the full sample. The label at each date uses only features up to that date, but the parameters that turn features into labels have seen the whole history.",
      "States are named by their average 20-day volatility, lowest to highest.",
    ],
    reading: (
      <p>
        The stacked chart shows, for each week, how probable each state looked at the time. The current reading
        never shows more than 95% confidence: the model&apos;s raw probabilities are often near 100%, which
        overstates how sure anyone can be about an unobservable state. Expected durations come from the transition
        probabilities.
      </p>
    ),
    limitations: [
      "Regimes are descriptive. A regime label says what recent volatility and trend look like, not what comes next.",
      "Features are backward-looking 20- and 60-day windows, so the model recognizes a change weeks after it starts.",
      "Four states is a modeling choice. More states fit better and mean less.",
    ],
    failures: [
      <>
        The fit depends on its random starting point. On the current data, the original model&apos;s fixed seed
        landed on a clearly worse fit (lower likelihood) whose labels agreed with the best fit on only about a third
        of days. The engine now fits from eight starting points, keeps the most likely, and reports how well the
        runners-up agree.
      </>,
      <>
        The original model named states bull, bear, recovery and crisis by their average same-day return. On this
        data every non-crisis state has a positive average return, so &quot;bear&quot; meant the lowest of three
        positive returns and flipped between fits that were otherwise identical. The states differ mainly in
        volatility, and are now named that way.
      </>,
      "If the HMM fails to fit, a Gaussian mixture without time dynamics is used instead and labeled as such.",
    ],
    changes: [
      "Labels use forward-filtered probabilities instead of the most likely path and smoothed probabilities, which used future data.",
      "Best of eight random starts; stability across starts is reported.",
      "States renamed by volatility rank.",
      "A feature that was an exact multiple of another (annualized and daily 20-day volatility) was removed; it made the covariance matrices singular.",
    ],
    validation: "regimes",
    validationIntro: "Agreement between the best fit and the other random starts, from the nightly fit on the current snapshot.",
    references: [
      "Hamilton, J. (1989). A new approach to the economic analysis of nonstationary time series and the business cycle. Econometrica 57(2).",
      "Rabiner, L. (1989). A tutorial on hidden Markov models and selected applications in speech recognition. Proceedings of the IEEE 77(2).",
      "Ang, A. and Timmermann, A. (2012). Regime changes and financial markets. Annual Review of Financial Economics 4.",
    ],
  },
  {
    slug: "factors",
    title: "Fama-French five-factor plus momentum regression",
    short: "Factor exposures",
    summary: "Which well-known sources of return the portfolio is exposed to, with honest standard errors.",
    what: (
      <p>
        The portfolio&apos;s daily return above the T-bill rate is regressed on six factor returns: the market, size
        (small minus big), value (high minus low book-to-market), profitability (robust minus weak), investment
        (conservative minus aggressive) and momentum (recent winners minus losers). The coefficients are the
        portfolio&apos;s exposures, or loadings.
      </p>
    ),
    why: (
      <p>
        Two portfolios with the same volatility can be exposed to completely different things. Factor loadings say
        what kind of stocks the portfolio behaves like, and how much of its return those exposures explain.
      </p>
    ),
    inputs: ["Daily portfolio returns over the last five years.", "Daily factor returns and the risk-free rate from the French library."],
    formula: `r_p,t − rf_t = α + β_M·MKT_t + β_S·SMB_t + β_V·HML_t + β_P·RMW_t + β_I·CMA_t + β_U·MOM_t + ε_t
Newey-West lags = ⌊4 (T/100)^(2/9)⌋        VIF_k = 1 / (1 − R²_k)`,
    assumptions: [
      "Loadings are constant over the window. The rolling chart shows how far that is from true.",
      "The relationship is linear.",
      "Newey-West (HAC) standard errors allow for autocorrelation and changing volatility in the residuals.",
    ],
    reading: (
      <p>
        A market loading of 1 means the portfolio moves one-for-one with the market after other factors are
        accounted for. Loadings whose 95% interval includes zero are shown in grey: the data cannot tell them apart
        from no exposure. Alpha is the average return the factors do not explain; its interval is almost always
        wide. The variance inflation factor (VIF) flags factors that move together in this sample; above 5, their
        separate loadings are unreliable.
      </p>
    ),
    limitations: [
      "The factors are built from US stocks. For bonds, gold or foreign stocks the loadings are harder to interpret and R² is lower.",
      "Factor data is published with a one-to-two-month lag.",
      "Daily data can understate loadings for holdings that trade infrequently or in other time zones.",
    ],
    failures: ["For portfolios with few stocks, the unexplained part is large and loadings move a lot from year to year."],
    changes: [
      "The original version regressed on six ETFs (SPY, IWM, IVE, MTUM, QUAL, QQQ). All hold large US stocks and move closely together, so their coefficients were unstable. The French factors are long-short portfolios designed to be close to independent.",
      "Newey-West standard errors and the VIF check are new.",
    ],
    validation: "factors",
    validationIntro: "Fit and collinearity for the example portfolios from the current snapshot.",
    references: [
      "Fama, E. and French, K. (2015). A five-factor asset pricing model. Journal of Financial Economics 116(1).",
      "Carhart, M. (1997). On persistence in mutual fund performance. Journal of Finance 52(1).",
      "Newey, W. and West, K. (1987). A simple, positive semi-definite, heteroskedasticity and autocorrelation consistent covariance matrix. Econometrica 55(3).",
      "Newey, W. and West, K. (1994). Automatic lag selection in covariance matrix estimation. Review of Economic Studies 61(4).",
    ],
  },
  {
    slug: "stress-tests",
    title: "Historical replay and custom shocks",
    short: "Stress tests",
    summary: "What history's worst market declines would have done to the portfolio, and a simple linear shock model.",
    what: (
      <p>
        For each of seven crises, from the dot-com bust to the 2025 tariff shock, the portfolio is bought at the
        S&amp;P 500&apos;s peak and held to its trough, using each holding&apos;s actual daily returns over that
        window. The custom shock applies a move in the stock market and in interest rates through each
        holding&apos;s estimated sensitivities.
      </p>
    ),
    why: (
      <p>
        Volatility and VaR describe ordinary bad days. Crises are different: correlations rise and losses compound.
        Replaying real episodes shows the path, not just the endpoint, and needs no distributional assumption.
      </p>
    ),
    inputs: [
      "Full price history of each holding and SPY.",
      "For holdings that did not trade during a crisis: their beta to SPY from their first three years of trading.",
      "For custom shocks: each holding's regression on SPY and IEF (7–10 year Treasuries) over the last three years.",
    ],
    formula: `replay:        R_p = Σ_i w_i · (P_i,trough / P_i,peak − 1)       (buy and hold, starting weights)
beta-scaled:   r_i,t = β_i · r_SPY,t      for holdings not yet trading
custom shock:  move_i = β_M,i · market_move + β_T,i · (−7.5 · Δyield)`,
    assumptions: [
      "Windows run from the S&P 500's closing high to its closing low; a holding could have fallen further on other dates.",
      "No rebalancing inside the window.",
      "Custom shocks are instantaneous and linear, and IEF's duration is taken as 7.5 years.",
    ],
    reading: (
      <p>
        The comparison against the S&amp;P 500 answers &quot;compared to what?&quot;. Each holding is labeled with
        the method used: actual returns, or beta-scaled when it did not exist yet. The share of weight replayed with
        actual data is shown for every scenario; below 100%, treat the result as an estimate.
      </p>
    ),
    limitations: [
      "Most ETFs did not exist in 2000, so portfolios of ETFs are largely beta-scaled in the dot-com scenario. Beta-scaling assumes the holding behaved like a leveraged S&P 500, which misses anything specific to it: bonds and gold, for example, rose in several of these crises.",
      "Seven episodes are not a distribution. The next crisis will differ.",
      "Custom shocks ignore changes in correlation during stress, which is when diversification tends to fail.",
    ],
    failures: ["For a holding with a short history, its estimated beta is noisy and the beta-scaled result inherits that noise."],
    changes: [
      "The original version scaled SPY's move by each holding's beta and a hand-set sector multiplier for every holding. It now replays actual returns wherever they exist.",
      "The 'recovery days' estimate (loss × 200) is removed; it had no basis.",
      "Hardcoded custom scenarios are replaced by sliders with the assumptions shown.",
    ],
    validation: "stress",
    validationIntro: "Share of each example portfolio's weight replayed with actual data, by scenario.",
    references: [
      "Basel Committee on Banking Supervision (2018). Stress testing principles.",
      "Kupiec, P. (1998). Stress testing in a value at risk framework. Journal of Derivatives 6(1).",
    ],
  },
  // ─── Options Pricing ────────────────────────────────────────────────────────
  {
    slug: "options-black-scholes",
    group: "options",
    title: "Black-Scholes-Merton and the Greeks",
    short: "Black-Scholes and Greeks",
    summary: "The closed-form price of a European option with a dividend yield, and its sensitivities to each input.",
    what: (
      <>
        <p>
          The Black-Scholes-Merton formula gives the price of a European option, one that can only be exercised at
          expiry, when the underlying price follows a lognormal random walk with constant volatility. Merton&apos;s
          extension adds a continuous dividend yield, which also covers stock indices and, with the foreign rate as
          the yield, currencies.
        </p>
        <p>
          The Greeks are the formula&apos;s partial derivatives: how much the price changes when one input moves and
          the others stay fixed. They are computed analytically.
        </p>
      </>
    ),
    why: (
      <p>
        It is the benchmark every other method on the page is checked against, and the convention markets use to
        quote options: a price is usually stated as the volatility that makes this formula reproduce it (its implied
        volatility). Where a closed form exists, it is exact under its assumptions and instant to compute.
      </p>
    ),
    inputs: [
      "Spot price S and strike K, in the same currency.",
      "Time to expiry T in years (calendar time).",
      "Risk-free rate r and dividend yield q, both continuously compounded.",
      "Volatility σ: the annualized standard deviation of log returns.",
      "Call or put.",
    ],
    formula: `d1 = [ln(S/K) + (r − q + σ²/2)·T] / (σ·√T)      d2 = d1 − σ·√T
Call = S·e^(−qT)·N(d1) − K·e^(−rT)·N(d2)
Put  = K·e^(−rT)·N(−d2) − S·e^(−qT)·N(−d1)
Parity: Call − Put = S·e^(−qT) − K·e^(−rT)
Delta (call) = e^(−qT)·N(d1)        Gamma = e^(−qT)·φ(d1) / (S·σ·√T)
Vega  = S·e^(−qT)·φ(d1)·√T          Rho (call) = K·T·e^(−rT)·N(d2)
Theta (call) = −S·e^(−qT)·φ(d1)·σ / (2√T) − r·K·e^(−rT)·N(d2) + q·S·e^(−qT)·N(d1)`,
    assumptions: [
      "The underlying follows geometric Brownian motion: log returns are normal, independent, with constant volatility.",
      "Interest rates and the dividend yield are constant and paid continuously.",
      "Trading is continuous and frictionless (no costs, no taxes, short selling allowed), and there is no arbitrage.",
      "European exercise only. American options are priced with the binomial tree instead.",
      "At expiry (T = 0) or with zero volatility the formula's limit is used: the option is worth its discounted forward intrinsic value, max(S·e^(−qT) − K·e^(−rT), 0) for a call.",
    ],
    reading: (
      <>
        <p>
          The price is in the same units as the spot price. On the page, vega is shown per one percentage point of
          volatility (the formula&apos;s vega divided by 100), rho per one percentage point of rates, and theta per
          calendar day (the annual figure divided by 365).
        </p>
        <p>
          The &quot;chance of finishing in the money&quot;, N(d2) for a call, is a probability under the risk-neutral
          measure, where the underlying is assumed to grow at the risk-free rate. It is a pricing device and not a
          forecast.
        </p>
      </>
    ),
    limitations: [
      "Real markets price different strikes and expiries at different volatilities (the volatility smile and term structure). One constant σ cannot match them all.",
      "Prices can jump (earnings, news), and returns have fatter tails than the normal distribution, so far out-of-the-money options tend to be worth more in markets than the formula says.",
      "Discrete cash dividends are approximated by a continuous yield.",
      "Greeks describe small moves with everything else fixed. In a large move, gamma and changing volatility dominate.",
    ],
    failures: [
      "Very short-dated, far out-of-the-money options have prices that round to zero; their Greeks are then zero too.",
      "The model's σ is an input. Garbage volatility gives a precise-looking wrong price.",
    ],
    validation: "options-bs",
    validationIntro:
      "Worked examples from Hull's textbook, recomputed by the running engine. Hull rounds to the digits shown; the engine matches each one. The test suite also checks put-call parity and every Greek against finite differences on a grid of inputs.",
    references: [
      "Black, F. and Scholes, M. (1973). The pricing of options and corporate liabilities. Journal of Political Economy 81(3).",
      "Merton, R. C. (1973). Theory of rational option pricing. Bell Journal of Economics and Management Science 4(1).",
      "Hull, J. C. Options, Futures, and Other Derivatives. Pearson (chapters on the Black-Scholes-Merton model, index options and the Greek letters).",
    ],
  },
  {
    slug: "options-monte-carlo",
    group: "options",
    title: "Monte Carlo option pricing",
    short: "Monte Carlo",
    summary: "Pricing by simulation, with antithetic variates and control variates to cut the error, and why it matters for path-dependent options.",
    what: (
      <>
        <p>
          Monte Carlo pricing simulates many possible prices of the underlying at expiry under the risk-neutral
          model, computes the option&apos;s payoff on each, and averages the discounted payoffs. The average
          converges to the true price, and the spread of the payoffs gives a standard error for the estimate.
        </p>
        <p>
          Two standard techniques reduce that error on the same number of paths. <b>Antithetic variates</b> pair
          every random draw Z with its mirror image −Z, which cancels part of the noise. A <b>control variate</b>{" "}
          uses a quantity whose true mean is known exactly (here the discounted terminal price, whose mean is
          S·e^(−qT)) and corrects the estimate by however far the simulated average of that quantity strayed from
          its true value.
        </p>
        <p>
          For an <b>Asian option</b>, whose payoff depends on the average price over a set of dates, whole price paths
          are simulated. There is no closed-form price for an arithmetic average. A geometric average does have one,
          and it moves almost in lockstep with the arithmetic one, so it serves as the control variate.
        </p>
      </>
    ),
    why: (
      <p>
        For a plain European option the formula is exact, so simulation is shown to make its error visible and to
        validate it against a known answer. The same machinery prices options that have no formula, such as the
        Asian option, where simulation is the practical method.
      </p>
    ),
    inputs: [
      "The same inputs as Black-Scholes-Merton.",
      "Number of paths: 5,000, 20,000 or 100,000 on the page (up to 200,000 through the API).",
      "For the Asian option: the averaging dates (weekly, monthly or daily over the option's life).",
      "A fixed random seed (42), so identical inputs always give identical numbers.",
    ],
    formula: `S_T = S·exp[(r − q − σ²/2)·T + σ·√T·Z],   Z ~ N(0, 1)
Estimate = e^(−rT) · mean(payoff(S_T))        SE = stdev(payoffs) / √n
Antithetic:  pair payoff(Z) with payoff(−Z) and average each pair
Control:     Ŷ = Ȳ − b·(X̄ − E[X]),  X = e^(−rT)·S_T,  E[X] = S·e^(−qT),  b = cov(Y, X) / var(X)
95% interval = estimate ± 1.96 · SE
Variance reduction = SE(plain)² / SE(reduced)²   (how many times more plain paths the same precision needs)
Asian call payoff = max(mean(S_t1, …, S_tn) − K, 0);   control: geometric average (closed form)`,
    assumptions: [
      "Geometric Brownian motion under the risk-neutral measure, as in Black-Scholes-Merton. For a European payoff the terminal price is drawn exactly, so no time steps are needed.",
      "The control-variate coefficient b is estimated from the same simulated paths. This adds a bias of order 1/n, negligible at the path counts used.",
      "The 95% interval uses the normal approximation to the sampling distribution of the mean.",
      "Asian options are European-style (settled at expiry) and averaged over equally spaced dates ending at expiry.",
      "Random numbers come from NumPy's PCG64 generator.",
    ],
    reading: (
      <p>
        The ± figure is sampling error only: it shrinks with the square root of the number of paths and says nothing
        about whether the model fits a real market. A variance reduction of ×25 means plain Monte Carlo would need
        25 times as many paths for the same precision. The convergence chart uses a log scale, on which a band that
        shrinks like 1/√n narrows steadily.
      </p>
    ),
    limitations: [
      "Convergence is slow: halving the error takes four times the paths.",
      "American options are not priced by simulation here; that needs a regression method such as Longstaff-Schwartz. The binomial tree handles them.",
      "Averaging is discrete, on the stated dates. A continuously averaged option would be slightly cheaper.",
      "Every simulation inherits the lognormal, constant-volatility assumptions of the underlying model.",
    ],
    failures: [
      "For deep out-of-the-money options almost every path pays zero, so a few paths carry the estimate and the standard error itself is noisy. The interval can then cover the true price less often than 95%.",
      "With very few paths the normal approximation behind the interval is poor.",
    ],
    validation: "options-mc",
    validationIntro:
      "How often the 95% interval contains the exact Black-Scholes price, over many independent runs with different seeds, recomputed by the running engine.",
    references: [
      "Boyle, P. (1977). Options: a Monte Carlo approach. Journal of Financial Economics 4(3).",
      "Glasserman, P. (2003). Monte Carlo Methods in Financial Engineering. Springer (chapter 4, variance reduction).",
      "Kemna, A. and Vorst, A. (1990). A pricing method for options based on average asset values. Journal of Banking and Finance 14(1).",
    ],
  },
  {
    slug: "options-binomial",
    group: "options",
    title: "Binomial trees and early exercise",
    short: "Binomial trees",
    summary: "A Cox-Ross-Rubinstein tree that values American options by checking at every step whether exercising beats holding.",
    what: (
      <>
        <p>
          The tree divides the time to expiry into N steps. In each step the price moves up by a factor u or down by
          d = 1/u. Working backward from the payoffs at expiry, each node&apos;s value is the discounted
          risk-neutral average of the two nodes after it. For an American option the node is worth the larger of
          that holding value and the payoff from exercising right there.
        </p>
        <p>
          The early-exercise premium is the American price minus the European price on the same tree, so the
          tree&apos;s discretization error largely cancels.
        </p>
      </>
    ),
    why: (
      <p>
        The Black-Scholes formula cannot value the right to exercise early. The tree can, and as the steps get finer
        its European price converges to the formula, which makes it easy to check.
      </p>
    ),
    inputs: [
      "The same inputs as Black-Scholes-Merton.",
      "Number of steps N: 500 by default, 100 to 2,000 on the page (up to 5,000 through the API).",
    ],
    formula: `Δt = T / N,   u = e^(σ·√Δt),   d = 1 / u,   p = (e^((r − q)·Δt) − d) / (u − d)
Hold value  = e^(−r·Δt) · [p·V_up + (1 − p)·V_down]
European:   V = hold value
American:   V = max(hold value, exercise value)
Premium     = V_American − V_European   (same tree)`,
    assumptions: [
      "The same lognormal, constant-volatility model as Black-Scholes-Merton, in discrete steps.",
      "Exercise is possible only at the tree's time steps.",
      "When the drift is large relative to volatility, the standard CRR probability p falls outside 0 to 1 (the tree would allow arbitrage). The tree is then centered on the drift, u, d = e^((r − q)·Δt ± σ·√Δt), which converges to the same limit.",
      "Log prices at the extreme nodes are capped to stay finite; those nodes carry negligible probability.",
    ],
    reading: (
      <>
        <p>
          The European tree price zigzags toward the Black-Scholes value as steps are added, because the strike falls
          at different positions between nodes. The error shrinks roughly in proportion to 1/N.
        </p>
        <p>
          Without dividends, an American call is never worth exercising early: exercising gives up the option&apos;s
          time value and the interest on the strike. Its price equals the European price (Merton, 1973). American
          puts, and calls on dividend-paying assets, can be worth exercising early, and the chart of value against
          spot shows where the American value meets the payoff line.
        </p>
      </>
    ),
    limitations: [
      "The zigzag means a single tree price can be off by more than its average error; smoothing techniques (averaging adjacent N, or a Black-Scholes value at the last step) are not applied.",
      "Discrete cash dividends, which drive most early exercise of calls in practice, are approximated by a continuous yield.",
      "Constant volatility; the tree does not reproduce a volatility smile.",
    ],
    failures: [
      "Very few steps give a coarse price; with five steps the tree is a teaching example, not a price.",
      "The exercise boundary read from the chart is limited by the tree's grid and the spacing of the spot prices shown.",
    ],
    validation: "options-binomial",
    validationIntro:
      "Hull's five-step American put, then the European tree price at increasing steps against the exact Black-Scholes value, recomputed by the running engine.",
    references: [
      "Cox, J. C., Ross, S. A. and Rubinstein, M. (1979). Option pricing: a simplified approach. Journal of Financial Economics 7(3).",
      "Merton, R. C. (1973). Theory of rational option pricing. Bell Journal of Economics and Management Science 4(1).",
      "Hull, J. C. Options, Futures, and Other Derivatives. Pearson (chapters on binomial trees).",
    ],
  },
  {
    slug: "options-implied-vol",
    group: "options",
    title: "Implied volatility",
    short: "Implied volatility",
    summary: "The volatility at which the Black-Scholes-Merton formula reproduces an observed option price, found by a safeguarded Newton solver.",
    what: (
      <p>
        Every input to the Black-Scholes-Merton formula is observable except volatility. Implied volatility runs the
        formula backward: given an option&apos;s market price, it finds the σ that reproduces it. The solver uses
        Newton&apos;s method, which follows the slope of price against volatility (vega), inside a bracket that is
        known to contain the answer. Whenever a Newton step would leave the bracket, or vega is too small to trust,
        it bisects instead.
      </p>
    ),
    why: (
      <p>
        Traders quote and compare options by implied volatility rather than price, because it strips out the effect
        of strike, expiry and rates. A plain Newton solver can overshoot and fail for deep in- or out-of-the-money
        options where vega is tiny; the bracket guarantees convergence.
      </p>
    ),
    inputs: ["An observed European option price.", "Spot, strike, time to expiry, risk-free rate, dividend yield, call or put."],
    formula: `Find σ such that BS(σ) = observed price
Newton step:  σ ← σ − (BS(σ) − price) / vega(σ)
Bracket:      [10⁻⁶, 10]; tightened each step; bisect if Newton would leave it
Start:        σ₀ = √(2·|ln(F/K)| / T), clipped to [0.1, 2]    (Manaster-Koehler; F = S·e^((r − q)·T))
No-arbitrage range (call): max(S·e^(−qT) − K·e^(−rT), 0) < price < S·e^(−qT)`,
    assumptions: [
      "The price is for a European option under Black-Scholes-Merton with the stated rate and dividend yield.",
      "The price is a single figure (in practice, the midpoint of the bid and ask).",
      "Convergence when the repriced option is within 10⁻¹⁰ of the target (relative to the price, for prices above 1).",
    ],
    reading: (
      <p>
        An implied volatility above your own volatility estimate means the price embeds more expected movement (or a
        risk premium) than you assume. Entering the model price recovers the input volatility, which is the round-trip
        check the page runs by default.
      </p>
    ),
    limitations: [
      "Prices of American options include an early-exercise premium, so inverting the European formula overstates their implied volatility, mostly for in-the-money puts.",
      "Near the no-arbitrage bounds the problem is ill-conditioned: vega is tiny, and a one-cent change in price can move the implied volatility by several points. The solver still converges; the answer is just not informative.",
      "One implied volatility per option. Fitting a smile or surface across strikes is out of scope.",
    ],
    failures: [
      "A price below the zero-volatility value or above the upper bound has no implied volatility; the engine says so instead of returning a number.",
      "Volatility above 1,000% a year is treated as a sign of a bad input.",
    ],
    validation: "options-iv",
    validationIntro:
      "Hull's implied-volatility example, and round trips (price at a known σ, then solve back) across strikes, maturities and volatilities, recomputed by the running engine.",
    references: [
      "Manaster, S. and Koehler, G. (1982). The calculation of implied variances from the Black-Scholes model: a note. Journal of Finance 37(1).",
      "Hull, J. C. Options, Futures, and Other Derivatives. Pearson (implied volatility).",
    ],
  },
  // ─── Transaction ML ─────────────────────────────────────────────────────────
  {
    slug: "transactions-data",
    group: "transactions",
    title: "Synthetic transaction data",
    short: "Synthetic data",
    summary: "How the invented bank-statement descriptors are generated, and why the train, validation and test splits are made by merchant rather than by row.",
    what: (
      <>
        <p>
          A seeded generator invents 24,000 bank-statement lines in 14 spending categories. Each line has a descriptor
          (the text a bank prints, such as &quot;SQ *BLUE BOTTLE COFFEE SAN FRANCISCO CA&quot;), a date, and usually an
          amount. Merchants are either well-known public brands or local businesses assembled from generic word
          lists. The people in peer-to-peer transfers and the employers in payroll deposits are made up.
        </p>
        <p>
          The generator imitates how card and ACH descriptors look: processor prefixes (&quot;SQ *&quot;,
          &quot;TST*&quot;, &quot;PAYPAL *&quot;), store numbers, a city and state, reference numbers, truncation to a
          fixed field width, abbreviations, dropped punctuation and mixed casing. Amounts follow a distribution per
          category, and one row in ten has no amount at all.
        </p>
      </>
    ),
    why: (
      <>
        <p>
          Real transaction data is personal financial data. Publishing it, or a model trained on it, is not an option,
          and no public dataset of labeled statement descriptors is large and clean enough to use. Synthetic data makes
          the whole pipeline reproducible and shareable: anyone can regenerate the exact dataset from the seed.
        </p>
        <p>
          The split is the part that matters most. Every transaction from one merchant, and from its sister brands
          (for example a ride-hailing app and its food-delivery arm), goes to exactly one of training, validation or
          test. The test set therefore measures what the model does with a merchant it has never seen, which is the
          only hard case in practice: a merchant already seen can be looked up.
        </p>
      </>
    ),
    inputs: [
      "A fixed seed (20260928), so the dataset is identical on every machine.",
      "About 210 public brand names, each with a category and descriptor templates.",
      "Generic word lists for local businesses (for example \"family dental\", \"taqueria\", \"auto repair\"), about 70 invented merchants per category.",
      "Split shares of 70% training, 15% validation and 15% test, assigned by merchant group.",
    ],
    assumptions: [
      "The descriptor noise (prefixes, truncation, casing, store numbers) resembles what US banks print. It was written from public examples of statement formats, not measured on real statements.",
      "Category frequencies and amount ranges are plausible but invented.",
      "Each merchant has one true category, except a few deliberately ambiguous chains (a supercenter receipt can be groceries or shopping) whose label is drawn at random per transaction. That puts a floor under the error rate, as with real data.",
    ],
    reading: (
      <p>
        The table below counts rows, merchants and merchant groups in each split. &quot;Merchant groups shared across
        splits&quot; must be zero: that is the leakage check. Test counts per category show how much evidence stands
        behind each per-category score; categories with a few hundred test rows from a handful of merchants have wide
        uncertainty.
      </p>
    ),
    limitations: [
      "Synthetic text is cleaner and more regular than real statements. Scores here are an upper bound on what the same model would reach on real bank data.",
      "The brand list is finite. A real deployment meets thousands of merchants the generator never imagined.",
      "Only US-style descriptors in English.",
    ],
    failures: [
      "If the generator's templates are too distinctive per category, the model learns the templates rather than the language of merchants. The by-merchant-type results on the limitations page are the check: local businesses built from category words are easy, unseen brand names are not.",
    ],
    validation: "tx-data",
    validationIntro: "Counts from the dataset the running engine's model was trained and tested on.",
    references: [
      "Kaufman, S., Rosset, S., Perlich, C. and Stitelman, O. (2012). Leakage in data mining: formulation, detection, and avoidance. ACM Transactions on Knowledge Discovery from Data 6(4).",
      "Jordon, J. et al. (2022). Synthetic data: what, why and how? The Royal Society and The Alan Turing Institute.",
    ],
  },
  {
    slug: "transactions-model",
    group: "transactions",
    title: "Features and model",
    short: "Features and model",
    summary: "Character n-grams, words and amount flags feeding a temperature-scaled multinomial logistic regression, with an exact per-word explanation of every prediction.",
    what: (
      <>
        <p>
          Each descriptor is normalized (lower case, accents folded, punctuation removed, every digit mapped to 0 so store and reference numbers keep their shape but cannot be memorized) and turned into
          three blocks of features: character n-grams of 3 to 5 characters within word boundaries, words and word
          pairs, and a handful of amount flags (debit or credit, a size bin, whole dollars, a .99 or .95 ending, or
          &quot;amount missing&quot;). The text blocks are TF-IDF weighted with sublinear term frequency and scaled to
          unit length per block.
        </p>
        <p>
          A multinomial logistic regression turns the features into one score per category, and a softmax turns the
          scores into probabilities. The probabilities are divided by a temperature T fitted on validation merchants
          (temperature scaling), which fixes over- or under-confidence without changing which category wins.
        </p>
      </>
    ),
    why: (
      <>
        <p>
          Character n-grams survive the damage statement formats do to names: &quot;STARBUCKS #1234&quot; and a
          truncated &quot;STARBUCK&quot; share most of their n-grams, and so do &quot;COFFEE&quot; and
          &quot;COFFE&quot;. Words add meaning that n-grams blur, such as &quot;family dental&quot;.
        </p>
        <p>
          A linear model is used because it is explainable exactly. A category&apos;s score is a sum over features, so
          every prediction can be broken down into how much each word and the amount pushed toward or away from each
          category, and the pieces add up to the score. On short texts like these, linear models on n-grams are also
          hard to beat by much.
        </p>
      </>
    ),
    inputs: [
      "A descriptor of up to 200 characters.",
      "An optional amount in dollars (negative for money going out).",
      "The trained artifact: vocabulary, IDF weights, coefficients (stored as float16), intercepts and the temperature.",
    ],
    formula: `x = [ tfidf_char(d) / ‖·‖ ,  tfidf_word(d) / ‖·‖ ,  0.5 · amount_flags(a) ]
score_k = w_k · x + b_k
P(k | d, a) = exp(score_k / T) / Σ_j exp(score_j / T)
Contribution of feature i to category k = x_i · (w_ik − mean_j w_ij) / T
Σ_i contributions + (b_k − mean_j b_j) / T = centered score of k`,
    assumptions: [
      "Word order beyond pairs does not matter.",
      "Features add up: the model cannot learn that a word means one thing next to another word and something else alone, beyond what word pairs capture.",
      "The regularization strength C is chosen on validation merchants by macro-F1, and the temperature by log loss on the same merchants. The test set is used once, at the end.",
      "Training runs offline with scikit-learn (L2-penalized, L-BFGS). The site runs inference in NumPy from the saved weights, so scikit-learn is not needed to serve predictions.",
    ],
    reading: (
      <>
        <p>
          The confidence shown is the calibrated probability of the top category. The explanation colors each word
          by how much it moved the score of the chosen category: toward it, or away from it. Contributions are
          measured against the average across categories, because adding the same number to every category&apos;s
          score changes nothing.
        </p>
        <p>
          A low share of known features (text the model has never seen) is a warning sign: the model is then
          guessing mostly from the amount and generic fragments.
        </p>
      </>
    ),
    limitations: [
      "An explanation shows what the model used, not why a category is right. A confident prediction built on a store-number fragment is still a guess.",
      "Weights are stored as float16 to keep the artifact under 1 MB. The published test metrics are recomputed from the stored float16 weights, so they describe the model that is actually served.",
      "The vocabulary is fixed at training time. New words carry no weight until the model is retrained.",
    ],
    failures: [
      "A brand name made of another category's words (say, a clothing brand called \"Harvest Kitchen\") is classified by its words, confidently and wrongly.",
      "Very short descriptors (\"PAYMENT\", \"POS 0412\") carry almost no signal; the prediction then leans on the amount.",
    ],
    validation: "tx-model",
    validationIntro:
      "The regularization search on validation merchants, and ablations measured on the test merchants: each feature block alone and in combination.",
    references: [
      "Jurafsky, D. and Martin, J. H. Speech and Language Processing, 3rd ed. draft (chapters on logistic regression and naive Bayes text classification).",
      "Guo, C., Pleiss, G., Sun, Y. and Weinberger, K. Q. (2017). On calibration of modern neural networks. ICML.",
      "Pedregosa, F. et al. (2011). Scikit-learn: machine learning in Python. Journal of Machine Learning Research 12.",
    ],
  },
  {
    slug: "transactions-evaluation",
    group: "transactions",
    title: "Evaluation and leakage control",
    short: "Evaluation and leakage",
    summary: "Accuracy, macro-F1 and calibration on unseen merchants, compared with keyword rules and a majority guess, with merchant-level bootstrap intervals and a measured leaky split.",
    what: (
      <>
        <p>
          The model is scored once on the test merchants. Accuracy is the share of rows categorized correctly.
          Macro-F1 averages the F1 score (the harmonic mean of precision and recall) over the 14 categories, so a small
          category counts as much as a large one. Calibration is measured with the expected calibration error (ECE):
          predictions are grouped into ten confidence bins, and ECE is the row-weighted average gap between the
          confidence and the accuracy in each bin.
        </p>
        <p>
          Two baselines put the numbers in context: always guessing the most common category, and a list of keyword
          rules of the kind a person would write (&quot;UBER&quot; is transport, &quot;PAYROLL&quot; is income).
          A third line uses the rules when one matches and the model otherwise.
        </p>
      </>
    ),
    why: (
      <>
        <p>
          A model only earns its complexity if it beats the simple alternatives on the hard case. Keyword rules are
          what most budgeting tools start with, so they are the baseline that matters.
        </p>
        <p>
          The same model is also scored on a random row split, where most test merchants were seen in training. The
          gap between the two numbers is the size of the mistake the merchant split avoids.
        </p>
      </>
    ),
    inputs: [
      "Test rows: every transaction from 15% of merchant groups, none seen in training or validation.",
      "The model's calibrated probabilities and the baselines' predictions for the same rows.",
      "1,000 bootstrap resamples of merchant groups for the intervals.",
    ],
    formula: `Precision_k = TP_k / (TP_k + FP_k)     Recall_k = TP_k / (TP_k + FN_k)
F1_k = 2 · Precision_k · Recall_k / (Precision_k + Recall_k)     Macro-F1 = mean_k F1_k
ECE = Σ_b (n_b / n) · | accuracy_b − confidence_b |   (10 equal-width bins)
Log loss = −(1/n) Σ_i ln P(true category of row i)`,
    assumptions: [
      "Rows from the same merchant are not independent: a model that misses a brand misses all of its rows. The bootstrap therefore resamples whole merchants, which gives wider and more honest intervals than resampling rows.",
      "The gain over the keyword rules uses the same resamples for both, so it is a paired interval.",
      "Temperature scaling is fitted on validation merchants and never sees test rows.",
    ],
    reading: (
      <>
        <p>
          Read the interval before the point estimate. With about 170 test merchants, one brand family can move
          accuracy by a few points, and the intervals show it.
        </p>
        <p>
          ECE near zero means the confidence can be taken at face value: of predictions made at 80% confidence, about
          80% are right. The coverage table on the limitations page shows the practical use: accept confident
          predictions automatically and send the rest to a person.
        </p>
      </>
    ),
    limitations: [
      "All numbers come from synthetic data. They show the method working and failing in controlled conditions, not what it would score on a real bank's data.",
      "The keyword rules were written by the same person who wrote the generator, so they are a fair but not an adversarial baseline.",
      "Rules-first can beat the model alone here because the rules were written for the very brands in the generator's list. On unseen merchants rules only help when a category word appears in the name.",
    ],
    failures: [
      "A random row split would report near-perfect accuracy for a model that has only memorized merchant names. The table below shows by how much.",
      "Macro-F1 on a category with few test merchants rests on very little evidence.",
    ],
    validation: "tx-eval",
    validationIntro:
      "Test-set results for the model the running engine serves. The test suite recomputes them from the stored weights and checks the metric code against scikit-learn's.",
    references: [
      "Naeini, M. P., Cooper, G. F. and Hauskrecht, M. (2015). Obtaining well calibrated probabilities using Bayesian binning. AAAI.",
      "Efron, B. and Tibshirani, R. J. (1993). An Introduction to the Bootstrap. Chapman and Hall.",
      "Kapoor, S. and Narayanan, A. (2023). Leakage and the reproducibility crisis in machine-learning-based science. Patterns 4(9).",
    ],
  },
  {
    slug: "transactions-limitations",
    group: "transactions",
    title: "Transaction ML limitations",
    short: "Limitations",
    summary: "Where the categorizer is weak: unseen brand names, missing amounts, ambiguous merchants, and the gap between synthetic and real statements.",
    what: (
      <>
        <p>
          The categorizer is a demonstration of a method on invented data. It shows how a transparent text model
          behaves on merchants it has never seen, how to measure that honestly, and how confidence can be used to
          decide when to ask a person.
        </p>
        <p>
          It is weakest on well-known brand names it has not seen, because a brand name often says nothing about what
          the brand sells. Local businesses are easy for the opposite reason: their names usually contain the category
          (&quot;... family dental&quot;, &quot;... auto repair&quot;).
        </p>
      </>
    ),
    why: (
      <p>
        Every model has a region where it should not be trusted. Publishing where that region is, with numbers, is
        more useful than a single headline accuracy.
      </p>
    ),
    inputs: [
      "The same test merchants as the evaluation page, grouped by merchant type.",
      "The model's accuracy with and without the amount.",
      "Coverage and accuracy at confidence thresholds from 30% to 99%.",
    ],
    assumptions: [
      "A person reviewing low-confidence predictions is available and correct. Coverage figures describe how much work is left for them.",
      "The descriptor is the only text. Real systems also use the merchant category code (MCC) sent by the card network, which settles most of these cases and is not modeled here.",
    ],
    reading: (
      <p>
        The first table shows accuracy by merchant type; the gap between brands and local businesses is the main
        weakness. The coverage table reads as a trade-off: at a higher confidence threshold, fewer rows are categorized
        automatically, and those that are are more often right.
      </p>
    ),
    limitations: [
      "Synthetic data. The model has never seen a real bank statement, and real descriptors are messier and far more varied.",
      "Unseen brands are often wrong. The model can only use the characters in the name, and many brand names carry no category information.",
      "One category per transaction. A supercenter receipt that is half groceries, half household goods gets one label.",
      "No personalization. People disagree on categories (is a coffee subscription dining or a subscription?); the model learns the generator's labels.",
      "US English descriptors only.",
      "Educational only. Do not use it for tax, accounting or credit decisions.",
    ],
    failures: [
      "Descriptors that are mostly reference numbers or processor boilerplate.",
      "Names that collide with another category's vocabulary.",
      "Amounts far outside the training ranges (a $40,000 grocery bill) push the amount flags into rarely seen bins.",
      "Very long or unusual input is rejected rather than guessed: over 200 characters, or text with no letters or digits, returns an error.",
    ],
    validation: "tx-limits",
    validationIntro: "Accuracy by merchant type, the effect of a missing amount, and the coverage-accuracy trade-off, on the test merchants.",
    references: [
      "Chow, C. K. (1970). On optimum recognition error and reject tradeoff. IEEE Transactions on Information Theory 16(1).",
      "Mitchell, M. et al. (2019). Model cards for model reporting. FAT* Conference.",
    ],
  },
];

export const METHOD_GROUPS: { id: MethodGroup; title: string; blurb: string }[] = [
  {
    id: "portfolio",
    title: "DeanOS: portfolio models",
    blurb: "The models behind the portfolio explorer: performance, risk, volatility, simulation, regimes, factors and stress tests.",
  },
  {
    id: "options",
    title: "Options Pricing",
    blurb: "The models behind the options pricer: a closed-form formula, simulation, trees, and the inverse problem of implied volatility.",
  },
  {
    id: "transactions",
    title: "Transaction ML",
    blurb: "The categorizer behind Transaction ML: synthetic data, an explainable text model, evaluation on unseen merchants, and where it fails.",
  },
];

export function groupOf(m: Method): MethodGroup {
  return m.group ?? "portfolio";
}

export function getMethod(slug: string): Method | undefined {
  return METHODS.find((m) => m.slug === slug);
}
